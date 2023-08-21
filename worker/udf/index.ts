// @ts-nocheck
// user defined function to scale formula field function

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const.ts"

const bc = new BroadcastChannel(EidosDataEventChannelName)

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

// user defined function to handle data event
export const eidos_data_event_update = {
  name: "eidos_data_event_update",
  xFunc: function (pCx, table, _new, _old) {
    bc.postMessage({
      type: EidosDataEventChannelMsgType.DataUpdateSignalType,
      payload: {
        type: DataUpdateSignalType.Update,
        table,
        _new: JSON.parse(_new),
        _old: JSON.parse(_old),
      },
    })
  },
}

export const eidos_data_event_insert = {
  name: "eidos_data_event_insert",
  xFunc: function (pCx, table, _new) {
    bc.postMessage({
      type: EidosDataEventChannelMsgType.DataUpdateSignalType,
      payload: {
        type: DataUpdateSignalType.Insert,
        table,
        _new: JSON.parse(_new),
      },
    })
  },
}

export const eidos_data_event_delete = {
  name: "eidos_data_event_delete",
  xFunc: function (pCx, table, _old) {
    bc.postMessage({
      type: EidosDataEventChannelMsgType.DataUpdateSignalType,
      payload: {
        type: DataUpdateSignalType.Delete,
        table,
        _old: JSON.parse(_old),
      },
    })
  },
}

export const ALL_UDF = [
  twice,
  today,
  eidos_data_event_update,
  eidos_data_event_insert,
  eidos_data_event_delete,
]
