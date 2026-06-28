import type { Sprite } from '../types'

interface Props {
  sprites: Sprite[]
  baseUrl: string
}

export function SpriteLayer({ sprites, baseUrl }: Props) {
  return (
    <>
      {sprites.map((sprite, i) => {
        const src = sprite.url.startsWith('/')
          ? `${baseUrl}${sprite.url}`
          : sprite.url
        return (
          <img
            key={i}
            src={src}
            alt=""
            style={{
              position: 'absolute',
              bottom: sprite.y ?? 0,
              left: `calc(50% + ${sprite.x ?? 0}px - ${(sprite.width ?? 0) / 2}px)`,
              width: sprite.width ?? undefined,
              height: sprite.height ?? undefined,
              objectFit: 'contain',
            }}
          />
        )
      })}
    </>
  )
}
