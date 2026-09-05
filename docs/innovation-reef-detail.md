# 智能创新中心海底素材

当前页面使用 `public/assets/ocean/innovation-reef-no-fish.png`，尺寸为 1672 × 941。

素材基于用户提供的海底图片，使用内置 image_gen 编辑去除图片中静止的鱼群，保留海底、岩礁与珊瑚构图。页面另行绘制 20 条动态鱼，并复用原有水母组件。水光与水流由 WebGL 实时渲染；不支持 WebGL 时仍显示海底背景。

标题使用项目已有的 Noto Serif SC 字体，并提供系统宋体回退；正文使用系统无衬线字体。

## 背景编辑提示词

Use case precise-object-edit. Create a clean plate for animation from this exact image: remove ONLY every fish and every school of fish, including the big blue fish at upper left, all little fish at left and in the middle, all fish at the right, and the large fish on the lower right. Inpaint the fish areas naturally with the surrounding blue water or background rocks. Keep the entire rest of the image unchanged: EXACT composition and same framing, same camera, same rock ledges, same plants and corals, same original soft natural rock texture, same exposure, same light beams, same colors, same resolution and aspect ratio. Do not sharpen, enhance, restyle, move rocks, simplify coral, or introduce any creatures or objects. No text, no UI. The result should look identical to the original underwater image except that there are zero fish.
