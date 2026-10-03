(() => {
  const monthNumbers = new Map([
    ["jan", 0], ["január", 0],
    ["feb", 1], ["február", 1],
    ["márc", 2], ["március", 2],
    ["ápr", 3], ["április", 3],
    ["máj", 4], ["május", 4],
    ["jún", 5], ["június", 5],
    ["júl", 6], ["július", 6],
    ["aug", 7], ["augusztus", 7],
    ["szept", 8], ["szeptember", 8],
    ["okt", 9], ["október", 9],
    ["nov", 10], ["november", 10],
    ["dec", 11], ["december", 11]
  ]);

  const normalizedDay = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const relativeLabel = (monthName, dayNumber) => {
    const month = monthNumbers.get(
      monthName.toLocaleLowerCase("hu-HU").replace(/\.$/, "")
    );
    if (month === undefined) return "";

    const today = normalizedDay(new Date());
    let eventDate = new Date(today.getFullYear(), month, Number(dayNumber));
    const halfYear = 183 * 86400000;
    if (eventDate - today > halfYear) {
      eventDate = new Date(today.getFullYear() - 1, month, Number(dayNumber));
    } else if (today - eventDate > halfYear) {
      eventDate = new Date(today.getFullYear() + 1, month, Number(dayNumber));
    }

    const difference = Math.round((eventDate - today) / 86400000);
    if (difference === 0) return "Ma";
    if (difference === 1) return "Holnap";
    return "";
  };

  const updateMeta = (meta) => {
    const currentText = meta.textContent.replace(/\s+/g, " ").trim();
    if (!currentText || /^(Ma|Holnap)(?:\s*•|$)/i.test(currentText)) return;

    const match = currentText.match(
      /^([^•]+)\s*•\s*(Jan(?:uár)?|Feb(?:ruár)?|Márc(?:ius)?|Ápr(?:ilis)?|Máj(?:us)?|Jún(?:ius)?|Júl(?:ius)?|Aug(?:usztus)?|Szept(?:ember)?|Okt(?:óber)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?=\s*•)/i
    );
    if (!match) return;

    const label = relativeLabel(match[2], match[3]);
    if (!label) return;

    meta.textContent = currentText.replace(match[0], label);
  };

  const updateAllDates = (root = document) => {
    if (root instanceof Element && root.matches(".event-meta")) updateMeta(root);
    root.querySelectorAll?.(".event-meta").forEach(updateMeta);
  };

  const start = () => {
    updateAllDates();
    let frame = 0;
    new MutationObserver((mutations) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        mutations.forEach(({ addedNodes }) => {
          addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) updateAllDates(node);
          });
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
