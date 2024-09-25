import { lookup } from "@/lib/mime/mime";
import fs from "node:fs";
import path from "path";
import { getAppConfig } from "../config";

export const createSpace = (spaceName: string) => {
    const root = getAppConfig().dataFolder
    // root/<spaceName>/db.sqlite3
    const spaceFolder = path.join(root, 'spaces', spaceName)
    if (!fs.existsSync(spaceFolder)) {
        fs.mkdirSync(spaceFolder, { recursive: true });
    }
}

export const getSpaceDbPath = (spaceName: string) => {
    const root = getAppConfig().dataFolder
    // root/<spaceName>/db.sqlite3
    const spaceFolder = path.join(root, 'spaces', spaceName)
    if (!fs.existsSync(spaceFolder)) {
        fs.mkdirSync(spaceFolder, { recursive: true });
    }
    return path.join(spaceFolder, 'db.sqlite3')
}

export const getFileFromPath = (pathname: string) => {
    const root = getAppConfig().dataFolder
    // root/<spaceName>/files
    const filePath = path.join(root, 'spaces', pathname)
    // const pathname = `/${space}/files/${filename}`
    const file = fs.readFileSync(filePath)
    // buffer to file
    return new File([file], pathname, { type: lookup(pathname) as string || 'application/octet-stream' })
}