import { smartSplitFilePaths } from "./helper"

describe("smartSplitFilePaths", () => {
  test("single file path with commas in filename", () => {
    const input =
      "/files/Denzel Curry,Gizzle,Bren Joy - Dynasties & Dystopia.mp3"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual([
      "/files/Denzel Curry,Gizzle,Bren Joy - Dynasties & Dystopia.mp3",
    ])
  })

  test("multiple file paths separated by commas", () => {
    const input = "/files/song1.mp3, /files/song2.mp3"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual(["/files/song1.mp3", "/files/song2.mp3"])
  })

  test("multiple file paths with commas in filenames", () => {
    const input =
      "/files/Artist,Name - Song.mp3, /files/Another,Artist - Track.mp3"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual([
      "/files/Artist,Name - Song.mp3",
      "/files/Another,Artist - Track.mp3",
    ])
  })

  test("http URLs with commas", () => {
    const input = "https://example.com/file,with,commas.jpg"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual(["https://example.com/file,with,commas.jpg"])
  })

  test("multiple http URLs", () => {
    const input =
      "https://example.com/file,with,commas.jpg, https://example.com/another.jpg"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual([
      "https://example.com/file,with,commas.jpg",
      "https://example.com/another.jpg",
    ])
  })

  test("data URI", () => {
    const input = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual([
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
    ])
  })

  test("data URI with commas in base64 data", () => {
    // Base64 data can contain commas that should not split the URI
    const input = "data:image/jpg;base64,/9j/4AAQSkZJRgABAgAAAQ,ABAAD/2wBDAA"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual([
      "data:image/jpg;base64,/9j/4AAQSkZJRgABAgAAAQ,ABAAD/2wBDAA",
    ])
  })

  test("multiple data URIs separated by commas", () => {
    const input =
      "data:image/png;base64,iVBORw0KGgoAAAANSUh, data:image/jpg;base64,/9j/4AAQSkZJRgABAg"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual([
      "data:image/png;base64,iVBORw0KGgoAAAANSUh",
      "data:image/jpg;base64,/9j/4AAQSkZJRgABAg",
    ])
  })

  test("data URI with commas followed by file path", () => {
    const input = "data:image/png;base64,iVBORw0KGgo, /files/image.jpg"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual([
      "data:image/png;base64,iVBORw0KGgo",
      "/files/image.jpg",
    ])
  })

  test("data URI with commas and trailing new file", () => {
    const input =
      "data:image/jpg;base64,/9j/4AAQSkZJRgABAgAAAQ,ABAAD, /files/test.jpg"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual([
      "data:image/jpg;base64,/9j/4AAQSkZJRgABAgAAAQ,ABAAD",
      "/files/test.jpg",
    ])
  })

  test("mixed file paths and URLs", () => {
    const input =
      "/files/Song,Artist.mp3, https://example.com/image,file.jpg, data:image/png;base64,iVBORw"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual([
      "/files/Song,Artist.mp3",
      "https://example.com/image,file.jpg",
      "data:image/png;base64,iVBORw",
    ])
  })

  test("empty string", () => {
    const result = smartSplitFilePaths("")
    expect(result).toEqual([])
  })

  test("single file path without commas", () => {
    const input = "/files/simple-file.mp3"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual(["/files/simple-file.mp3"])
  })

  test("file paths with extra whitespace", () => {
    const input = "/files/song1.mp3  ,   /files/song2.mp3"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual(["/files/song1.mp3", "/files/song2.mp3"])
  })

  test("file path with multiple consecutive commas", () => {
    const input = "/files/Artist,,Band - Song.mp3"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual(["/files/Artist,,Band - Song.mp3"])
  })

  test("http and https URLs", () => {
    const input = "http://example.com/file1.jpg, https://example.com/file2.jpg"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual([
      "http://example.com/file1.jpg",
      "https://example.com/file2.jpg",
    ])
  })

  test("trailing comma with no following content", () => {
    const input = "/files/song.mp3,"
    const result = smartSplitFilePaths(input)
    // Trailing comma is preserved as part of the filename since there's no new path following it
    expect(result).toEqual(["/files/song.mp3,"])
  })

  test("comma at start (should be ignored)", () => {
    const input = ", /files/song.mp3"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual(["/files/song.mp3"])
  })

  test("real-world example from issue", () => {
    const input =
      "/files/Denzel Curry,Gizzle,Bren Joy - Dynasties & Dystopia _ Arcane League of Legends _ Riot Games Music - Riot Games Music (youtube,y_fB0IMbq54).mp3"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual([
      "/files/Denzel Curry,Gizzle,Bren Joy - Dynasties & Dystopia _ Arcane League of Legends _ Riot Games Music - Riot Games Music (youtube,y_fB0IMbq54).mp3",
    ])
  })

  test("multiple files with complex names", () => {
    const input =
      "/files/Artist1,Artist2 - Song (feat. Artist3).mp3, /files/Band1,Band2 - Track.flac, https://cdn.example.com/audio,file,name.mp3"
    const result = smartSplitFilePaths(input)
    expect(result).toEqual([
      "/files/Artist1,Artist2 - Song (feat. Artist3).mp3",
      "/files/Band1,Band2 - Track.flac",
      "https://cdn.example.com/audio,file,name.mp3",
    ])
  })
})
