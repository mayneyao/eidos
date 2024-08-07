export const AudioPlayer = (props: { url: string }) => {
  return (
    <audio className="w-full" controls preload="none" src={props.url}></audio>
  )
}
