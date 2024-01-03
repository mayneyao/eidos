import data from "@emoji-mart/data"
import { SearchIndex, init } from "emoji-mart"

init({ data })

export const useEmoji = () => {
  async function getEmoji(value?: string) {
    if (!value) {
      // random emoji
      const allEmojis = Object.keys((data as any).natives)
      const randomIndex = Math.floor(Math.random() * allEmojis.length)
      return allEmojis[randomIndex]
    }
    const emojis = await SearchIndex.search(value)
    const results = emojis.map((emoji: any) => {
      return emoji.skins[0].native
    })
    if (results.length > 0) {
      return results[0]
    } else {
      // random emoji
      const allEmojis = Object.keys((data as any).natives)
      const randomIndex = Math.floor(Math.random() * allEmojis.length)
      return allEmojis[randomIndex]
    }
  }
  return { getEmoji }
}
