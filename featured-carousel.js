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
        const description = content?.querySelector(".event-description");
        if (description && favoriteButton && favoriteButton.parentElement !== description) {
          description.append(favoriteButton);
        }
        const syncPanelHeight = () => {
          if (content) card.style.setProperty(
            "--featured-panel-height",
            `${Math.ceil(content.getBoundingClientRect().height)}px`
          );
        };
        if (content && !content.dataset.panelSizeObserved) {
          content.dataset.panelSizeObserved = "true";
          new ResizeObserver(syncPanelHeight).observe(content);
          syncPanelHeight();
        }
      });
    };

    const cards = () => [...carousel.querySelectorAll(".event-card.featured-card")];

    let itemCenters = [];
    let viewportWidth = 0;
    const activeIndex = () => {
      const center = carousel.scrollLeft + viewportWidth / 2;
      let selected = 0;
      let nearest = Number.POSITIVE_INFINITY;
      itemCenters.forEach((itemCenter, index) => {
        const distance = Math.abs(itemCenter - center);
        if (distance < nearest) {
          nearest = distance;
          selected = index;
        }
      });
      return selected;
    };

    const refreshLayout = () => {
      prepareCards();
      const items = cards();
      const bounds = carousel.getBoundingClientRect();
      viewportWidth = carousel.clientWidth;
      itemCenters = items.map(card => {
        const rect = card.getBoundingClientRect();
        return rect.left - bounds.left + carousel.scrollLeft + rect.width / 2;
      });
      if (pagination.childElementCount !== items.length) {
        pagination.replaceChildren(...items.map(() => {
          const dot = document.createElement("span");
          dot.className = "featured-pagination-dot";
          return dot;
        }));
      }
      pagination.hidden = items.length < 2;
      update();
    };
    const update = () => {
      const selected = activeIndex();
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
    new ResizeObserver(refreshLayout).observe(carousel);
    new MutationObserver(refreshLayout).observe(carousel, {
      childList: true,
      subtree: true
    });
    refreshLayout();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFeaturedCarousel, { once: true });
  } else {
    initFeaturedCarousel();
  }
})();
