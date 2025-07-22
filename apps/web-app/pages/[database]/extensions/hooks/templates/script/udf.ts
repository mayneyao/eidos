export const meta = {
  type: "udf",
  funcName: "myTwice",
  udf: {
    name: "myTwice",
    deterministic: true,
  },
}

function myTwice(arg: number) {
  return arg + arg
}
