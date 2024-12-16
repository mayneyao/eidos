import { lookup } from "@/lib/mime/mime";
import fs from "node:fs";
import path from "path";
import { getConfigManager } from "../config";

export const createSpace = (spaceName: string) => {
    const root = getConfigManager().get('dataFolder')
    // root/<spaceName>/db.sqlite3
    const spaceFolder = path.join(root, 'spaces', spaceName)
    if (!fs.existsSync(spaceFolder)) {
        fs.mkdirSync(spaceFolder, { recursive: true });
    }
}

export const getSpaceDbPath = (spaceName: string) => {
    const root = getConfigManager().get('dataFolder')
    // root/<spaceName>/db.sqlite3
    const spaceFolder = path.join(root, 'spaces', spaceName)
    if (!fs.existsSync(spaceFolder)) {
        fs.mkdirSync(spaceFolder, { recursive: true });
    }
    return path.join(spaceFolder, 'db.sqlite3')
}

export const getSpaceFileFromPath = (pathname: string) => {
    const root = getConfigManager().get('dataFolder')
    // root/<spaceName>/files
    const filePath = path.join(root, 'spaces', pathname)
    // const pathname = `/${space}/files/${filename}`
    const file = fs.readFileSync(filePath)
    // buffer to file
    return new File([file], pathname, { type: lookup(pathname) as string || 'application/octet-stream' })
}

export const getFileFromPath = (pathname: string) => {
    const root = getConfigManager().get('dataFolder')
    const filePath = path.join(root, pathname)
    const file = fs.readFileSync(filePath)
    return new File([file], pathname, { type: lookup(pathname) as string || 'application/octet-stream' })
}