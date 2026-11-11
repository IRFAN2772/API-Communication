const pending = new WeakSet();
let queue = Promise.resolve();

function scheduleDiagrams() {
  if (!window.mermaid) return;
  const diagrams = [...document.querySelectorAll(".mermaid:not([data-processed])")].filter(el => !pending.has(el));
  for (const diagram of diagrams) {
    pending.add(diagram);
    queue = queue.then(async () => {
      if (!diagram.isConnected) return;
      const host = document.createElement("div");
      host.setAttribute("aria-hidden", "true");
      // Guided stages may be hidden or change during rendering; measure in an independent surface.
      const width = diagram.getBoundingClientRect().width || document.querySelector(".markdown-section")?.clientWidth || 800;
      host.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;visibility:hidden;pointer-events:none;`;
      const copy = diagram.cloneNode(true);
      copy.removeAttribute("id");
      host.append(copy);
      document.body.append(host);
      try {
        await mermaid.run({ nodes: [copy] });
        if (diagram.isConnected) {
          diagram.replaceChildren(...copy.childNodes);
          diagram.dataset.processed = "true";
        }
      } catch (error) {
        console.error("Course diagram rendering failed", error);
        if (diagram.isConnected) {
          const notice = document.createElement("p");
          notice.setAttribute("role", "alert");
          notice.textContent = "This diagram could not render. Its source is shown below; use the surrounding explanation as a text alternative.";
          diagram.before(notice);
          diagram.dataset.processed = "failed";
        }
      } finally {
        host.remove();
        pending.delete(diagram);
      }
    });
  }
}

window.addEventListener("studio:lesson-ready", scheduleDiagrams);
window.addEventListener("load", scheduleDiagrams);
scheduleDiagrams();
