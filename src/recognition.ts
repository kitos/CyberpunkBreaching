let almostEqual = (a: number, b: number) => Math.abs(a - b) <= 15

interface ILocation {
  x: number
  y: number
  width: number
  height: number
}

let add = (a: number, b: number) => a + b

let avg = <T>(arr: T[], p: (el: T) => number) =>
  arr.map(p).reduce(add) / arr.length

export let groupToColumns = (codes: ILocation[]) => {
  let columns: ILocation[][] = []

  for (let c of codes) {
    let { x, width, height } = c

    let row = columns.find((groupAnnotation) => {
      let groupTop = avg(groupAnnotation, (a) => a.x)
      let groupWidth = avg(groupAnnotation, (a) => a.width)
      let groupHeight = avg(groupAnnotation, (a) => a.height)

      return (
        almostEqual(groupTop, x) &&
        almostEqual(groupWidth, width) &&
        almostEqual(groupHeight, height)
      )
    })

    if (row == null) {
      columns.push((row = []))
    }

    row!.push(c)
  }

  return columns
    .map((c) => c.sort((a, b) => a.y - b.y))
    .sort((a, b) => a[0].x - b[0].x)
}
