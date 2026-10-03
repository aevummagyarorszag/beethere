(() => {
  const initFeaturedCarousel = () => {
    const carousel = document.getElementById("featured-grid");
    if (!carousel) return;

    let pagination = carousel.nextElementSibling;
    if (!pagination?.classList.contains("featured-pagination")) {
      pagination = document.createElement("div");
      pagination.className = "featured-pagination";
      pagination.setAttribute("aria-hidden", "true");
      carousel.after(pagination);
    }

    const prepareCards = () => {
      carousel.querySelectorAll(".event-card.featured-card").forEach((card) => {
        const imageWrap = card.querySelector(".image-wrap");
        const content = card.querySelector(".event-content");
        if (imageWrap && content && content.parentElement !== imageWrap) {
          imageWrap.append(content);
        }
        const favoriteButton = card.querySelector(".favorite-button");
        if (content && favoriteButton && favoriteButton.parentElement !== content) {
          content.append(favoriteButton);
        }
      });
    };

    const cards = () => [...carousel.querySelectorAll(".event-card.featured-card")];

    const activeIndex = (items) => {
      const bounds = carousel.getBoundingClientRect();
      const center = bounds.left + bounds.width / 2;
      let selected = 0;
      let nearest = Number.POSITIVE_INFINITY;
      items.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - center);
        if (distance < nearest) {
          nearest = distance;
          selected = index;
        }
      });
      return selected;
    };

    const update = () => {
      prepareCards();
      const items = cards();
      if (pagination.childElementCount !== items.length) {
        pagination.replaceChildren(...items.map(() => {
          const dot = document.createElement("span");
          dot.className = "featured-pagination-dot";
          return dot;
        }));
      }
      pagination.hidden = items.length < 2;
      const selected = activeIndex(items);
      [...pagination.children].forEach((dot, index) => {
        dot.classList.toggle("is-active", index === selected);
      });
    };

    let frame = 0;
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    carousel.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    new MutationObserver(scheduleUpdate).observe(carousel, {
      childList: true,
      subtree: true
    });
    update();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFeaturedCarousel, { once: true });
  } else {
    initFeaturedCarousel();
  }
})();
