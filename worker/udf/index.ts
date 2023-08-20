// @ts-nocheck
// user defined function to scale formula field function

export const twice = {
  name: "twice",
  xFunc: function (pCx, arg) {
    return arg + arg
  },
  opt: {
    deterministic: true,
  },
}

export const today = {
  name: "today",
  xFunc: function (pCx) {
    return new Date().toISOString().slice(0, 10)
  },
  opt: {
    deterministic: true,
  },
}

export const ALL_UDF = [twice, today]
