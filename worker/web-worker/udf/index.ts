// @ts-nocheck
import { ScalarFunctionOptions } from "@sqlite.org/sqlite-wasm"
import { v4 } from "uuid"
import { uuidv7 as v7 } from "uuidv7"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType
} from "@/lib/const.ts"


export const withSqlite3AllUDF = (bc: {
  postMessage: (data: any) => void
}) => {
  const twice: ScalarFunctionOptions = {
    name: "twice",
    xFunc: function (pCx, arg) {
      return arg + arg
    },
    deterministic: true,
  }

  const twiceNoCtx = {
    name: "twice",
    xFunc: function (arg) {
      return arg + arg
    },
    deterministic: true,
  }

  const props = {
    name: "props",
    xFunc: function (pCx, arg) {
      return arg
    },
    deterministic: true,
  }

  const propsNoCtx = {
    name: "props",
    xFunc: function (arg) {
      return arg
    },
    deterministic: true,
  }

  const today = {
    name: "today",
    xFunc: function (pCx) {
      return new Date().toISOString().slice(0, 10)
    },
    deterministic: true,
  }

  const todayNoCtx = {
    name: "today",
    xFunc: function () {
      return new Date().toISOString().slice(0, 10)
    },
    deterministic: true,
  }

  const uuidv4 = {
    name: "uuidv4",
    xFunc: function (pCx) {
      return v4()
    },
    deterministic: false,
  }

  const uuidv4NoCtx = {
    name: "uuidv4",
    xFunc: function () {
      return v4()
    },
    deterministic: false,
  }

  const uuidv7 = {
    name: "uuidv7",
    xFunc: function (pCx) {
      return v7()
    },
    deterministic: false,
  }

  const uuidv7NoCtx = {
    name: "uuidv7",
    xFunc: function () {
      return v7()
    },
    deterministic: false,
  }

  const eidos_data_event_update = {
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

  const eidos_data_event_updateNoCtx = {
    name: "eidos_data_event_update",
    xFunc: function (table, _new, _old) {
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

  const eidos_data_event_insert = {
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

  const eidos_data_event_insertNoCtx = {
    name: "eidos_data_event_insert",
    xFunc: function (table, _new) {
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

  const eidos_data_event_delete = {
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

  const eidos_data_event_deleteNoCtx = {
    name: "eidos_data_event_delete",
    xFunc: function (table, _old) {
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

  const eidos_column_event_insert = {
    name: "eidos_column_event_insert",
    xFunc: function (pCx, table, _new) {
      bc.postMessage({
        type: EidosDataEventChannelMsgType.DataUpdateSignalType,
        payload: {
          type: DataUpdateSignalType.AddColumn,
          table,
          _new: JSON.parse(_new),
        },
      })
    },
  }

  const eidos_column_event_insertNoCtx = {
    name: "eidos_column_event_insert",
    xFunc: function (table, _new) {
      bc.postMessage({
        type: EidosDataEventChannelMsgType.DataUpdateSignalType,
        payload: {
          type: DataUpdateSignalType.AddColumn,
          table,
          _new: JSON.parse(_new),
        },
      })
    },
  }

  const eidos_column_event_update = {
    name: "eidos_column_event_update",
    xFunc: function (pCx, table, _new, _old) {
      bc.postMessage({
        type: EidosDataEventChannelMsgType.DataUpdateSignalType,
        payload: {
          type: DataUpdateSignalType.UpdateColumn,
          table,
          _new: JSON.parse(_new),
          _old: JSON.parse(_old),
        },
      })
    },
  }

  const eidos_column_event_updateNoCtx = {
    name: "eidos_column_event_update",
    xFunc: function (table, _new, _old) {
      bc.postMessage({
        type: EidosDataEventChannelMsgType.DataUpdateSignalType,
        payload: {
          type: DataUpdateSignalType.UpdateColumn,
          table,
          _new: JSON.parse(_new),
          _old: JSON.parse(_old),
        },
      })
    },
  }

  const eidos_meta_table_event_insert = {
    name: "eidos_meta_table_event_insert",
    xFunc: function (pCx, table, _new) {
      bc.postMessage({
        type: EidosDataEventChannelMsgType.MetaTableUpdateSignalType,
        payload: {
          type: DataUpdateSignalType.Insert,
          table,
          _new: JSON.parse(_new),
        },
      })
    },
  }

  const eidos_meta_table_event_insertNoCtx = {
    name: "eidos_meta_table_event_insert",
    xFunc: function (table, _new) {
      bc.postMessage({
        type: EidosDataEventChannelMsgType.MetaTableUpdateSignalType,
        payload: {
          type: DataUpdateSignalType.Insert,
          table,
          _new: JSON.parse(_new),
        },
      })
    },
  }

  const ALL_UDF = [
    twice,
    props,
    today,
    uuidv4,
    uuidv7,
    eidos_data_event_update,
    eidos_data_event_insert,
    eidos_data_event_delete,
    eidos_column_event_insert,
    eidos_column_event_update,
    eidos_meta_table_event_insert,
  ]

  const ALL_UDF_NO_CTX = [
    twiceNoCtx,
    propsNoCtx,
    todayNoCtx,
    uuidv4NoCtx,
    uuidv7NoCtx,
    eidos_data_event_updateNoCtx,
    eidos_data_event_insertNoCtx,
    eidos_data_event_deleteNoCtx,
    eidos_column_event_insertNoCtx,
    eidos_column_event_updateNoCtx,
    eidos_meta_table_event_insertNoCtx,
  ]

  return { ALL_UDF, ALL_UDF_NO_CTX }
}
