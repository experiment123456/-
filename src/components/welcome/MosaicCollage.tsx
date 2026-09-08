type Tile = { src: string; row: number; col: number; side: -1 | 1; order: number };

// 8 张项目功能截图，左右各 4 张；中央 (2,2) 是程序化核心格
const TILES: Tile[] = [
  { src: "/active-theory/assets/agent-cards/launch.png", row: 1, col: 1, side: -1, order: 3 },
  { src: "/active-theory/assets/agent-cards/guide.png", row: 1, col: 2, side: -1, order: 1 },
  { src: "/active-theory/assets/agent-cards/capabilities.png", row: 1, col: 3, side: 1, order: 2 },
  { src: "/active-theory/assets/agent-cards/security.png", row: 2, col: 1, side: -1, order: 2 },
  { src: "/active-theory/assets/agent-details/cryptography-lab.png", row: 2, col: 3, side: 1, order: 1 },
  { src: "/active-theory/assets/agent-details/interactive-guide.png", row: 3, col: 1, side: -1, order: 1 },
  { src: "/active-theory/assets/agent-details/security-boundaries.png", row: 3, col: 2, side: 1, order: 3 },
  { src: "/active-theory/assets/agent-details/agent-workspace.png", row: 3, col: 3, side: 1, order: 0 },
];

export default function MosaicCollage() {
  return (
    <div className="wc-collage" aria-hidden="true">
      {TILES.map((tile) => (
        <img
          key={tile.src}
          className="wc-tile"
          data-side={tile.side}
          data-order={tile.order}
          style={{ gridRow: tile.row, gridColumn: tile.col }}
          src={tile.src}
          alt=""
          draggable={false}
        />
      ))}
      <div className="wc-core" style={{ gridRow: 2, gridColumn: 2 }}>
        <span className="wc-core-glyph">L</span>
      </div>
    </div>
  );
}
