# ScriptRunner 3D Embed

Use `index.html` as the HTML5 game entrypoint.

Basic iframe:

```html
<iframe
  src="https://your-site.example/scriptrunner/index.html?embed=1"
  title="ScriptRunner 3D"
  style="width:100%;aspect-ratio:16/9;min-height:620px;border:0"
  allow="fullscreen; gamepad; autoplay"
  allowfullscreen>
</iframe>
```

Local preview page:

```text
embed.html
```

Useful query options:

```text
?embed=1          Compact iframe layout
?compact=1        Tighter header arrangement
?level=19         Start on a specific floor
?unlock=all       Unlock all floors for demos/testing
```

Host page messages:

```js
const frame = document.querySelector("iframe");

frame.contentWindow.postMessage({
  source: "scriptrunner3d-host",
  command: "reset"
}, "*");

window.addEventListener("message", (event) => {
  if (event.data?.source !== "scriptrunner3d") return;
  console.log(event.data.event, event.data.payload);
});
```

Runtime notes:

- Serve the folder over HTTP/HTTPS. Browser ES modules do not reliably run from `file://`.
- Three.js is vendored in `vendor/three`, so the game does not depend on the Three CDN.
- Progress is saved in the browser with `localStorage`.
