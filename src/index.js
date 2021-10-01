import cvModule from './opencv'
import { createWorker } from 'tesseract.js'
import { groupToColumns } from './recognition'

let captureVideo = async (cv) => {
  let mediaStream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { min: 640, ideal: 1080 },
      height: { min: 480, ideal: 720 },
      facingMode: 'environment',
    },
    audio: false,
  })
  let { width, height } = mediaStream.getTracks()[0].getSettings()

  let $video = document.createElement('video')

  $video.height = height
  $video.width = width
  $video.playsInline = true
  $video.srcObject = mediaStream
  $video.play()

  return [
    new cv.Mat($video.height, $video.width, cv.CV_8UC4),
    new cv.VideoCapture($video),
  ]
}

let vectorIterator = (v) => ({
  *[Symbol.iterator]() {
    for (let i = 0; i < v.size(); i++) {
      yield v.get(i)
    }
  },
})

let toContourMat = (cv, srcMat) => {
  let targetMat = new cv.Mat()

  cv.cvtColor(srcMat, targetMat, cv.COLOR_RGBA2GRAY, 0)
  // cv.bitwise_not(targetMat, targetMat)
  // cv.erode(targetMat, targetMat, cv.Mat.ones(1, 1, cv.CV_8U))
  cv.threshold(targetMat, targetMat, 150, 200, cv.THRESH_BINARY)
  cv.dilate(
    targetMat,
    targetMat,
    cv.Mat.ones(12, 12, cv.CV_8U),
    new cv.Point(-1, -1),
    1,
    cv.BORDER_CONSTANT,
    cv.morphologyDefaultBorderValue()
  )

  return targetMat
}

let prepareForRecognition = (cv, srcMat) => {
  cv.cvtColor(srcMat, srcMat, cv.COLOR_BGR2GRAY)
  cv.threshold(srcMat, srcMat, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU)

  return srcMat
}

let findMatrix = (cv, mat) => {
  let contourVector = new cv.MatVector()
  let hierarchy = new cv.Mat()

  cv.findContours(
    mat,
    contourVector,
    hierarchy,
    cv.RETR_TREE,
    cv.CHAIN_APPROX_SIMPLE
  )

  let contours = Array.from(vectorIterator(contourVector))
  let contoursWithoutChild = contours.filter((c, i) => {
    let [, , child] = hierarchy.intPtr(0, i)

    return child === -1
  })
  let rects = contoursWithoutChild.map((c) => cv.boundingRect(c))
  let columns = groupToColumns(rects)
  let matrixSize = Math.max(...columns.map((c) => c.length))

  let matrix = columns.filter((r) => r.length === matrixSize)

  return [matrix.length === matrixSize ? matrix : undefined, rects]
}

let renderTo = (cv, mat, canvasId, size) => {
  let matToRender = new cv.Mat()
  let aspectRatio = mat.rows / mat.cols

  cv.resize(
    mat,
    matToRender,
    new cv.Size(size, aspectRatio * size),
    0,
    0,
    cv.INTER_AREA
  )

  cv.imshow(canvasId, matToRender)

  matToRender.delete()
}

let drawRect = (
  cv,
  mat,
  { x, y, width, height },
  color = new cv.Scalar(0, 255, 0, 255)
) => {
  cv.rectangle(
    mat,
    new cv.Point(x, y),
    new cv.Point(x + width, y + height),
    color,
    1,
    cv.LINE_AA,
    0
  )
}

let matToBase64 = (cv, mat) => {
  let tempCanvas = document.createElement('canvas')
  cv.imshow(tempCanvas, mat)
  return tempCanvas.toDataURL()
}

cvModule.then(async (cv) => {
  // let videoMat = cv.imread(document.getElementById('img'))
  let [videoMat, videoCapture] = await captureVideo(cv)

  const tesseract = createWorker({
    logger: (m) => console.debug(m),
  })

  await tesseract.load()
  await tesseract.loadLanguage('eng')
  await tesseract.initialize('eng')

  let inProgress = false

  let recognise = async (matrix) => {
    if (inProgress) {
      return
    }

    inProgress = true

    let $matrix = document.getElementById('matrix')
    $matrix.innerHTML = ''
    $matrix.style.display = 'flex'

    for (let column of matrix) {
      let $column = document.createElement('div')
      $column.style.display = 'flex'
      $column.style.flexDirection = 'column'
      $matrix.appendChild($column)

      for (let cellBase64 of column) {
        let $cell = document.createElement('div')

        const {
          data: { text },
        } = await tesseract.recognize(cellBase64)

        $cell.innerText = text
        $cell.style.fontSize = '24px'

        $column.appendChild($cell)
      }
    }

    inProgress = false
  }

  let tick = () => {
    videoCapture.read(videoMat)

    let availableWidth = document.body.offsetWidth
    let contourMat = toContourMat(cv, videoMat)
    renderTo(cv, contourMat, 'contourCanvas', availableWidth / 2)

    let [matrix, allRects] = findMatrix(cv, contourMat)

    if (matrix) {
      let tl = matrix[0][0]
      let br = matrix[matrix.length - 1][matrix.length - 1]
      let matrixMat = prepareForRecognition(
        cv,
        videoMat.roi(
          new cv.Rect(
            tl.x,
            tl.y,
            br.x + br.width - tl.x,
            br.y + br.height - tl.y
          )
        )
      )
      renderTo(cv, matrixMat, 'matrixCanvas', availableWidth / 2)

      let imageMatrix = matrix.map((column) =>
        column.map((rect) => {
          drawRect(cv, videoMat, rect)

          return matToBase64(cv, prepareForRecognition(cv, videoMat.roi(rect)))
        })
      )

      recognise(imageMatrix)
    } else {
      allRects.forEach((rect) => {
        drawRect(cv, videoMat, rect, new cv.Scalar(255, 0, 0, 255))
      })
    }

    renderTo(cv, videoMat, 'canvas', availableWidth)
  }

  // document.getElementById('recognised').innerText = cha.join(' ')

  ;(function run() {
    try {
      tick()
      requestAnimationFrame(run)
    } catch (e) {
      console.error(e)
      let $error = document.querySelector('.error')

      $error.style.display = 'block'
      $error.innerHTML = e.message ?? 'Error occurred'
    }
  })()
})

const FPS = 30
