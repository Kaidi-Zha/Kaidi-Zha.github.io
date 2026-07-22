// Highlight active sidebar nav link on scroll
const sections = document.querySelectorAll('main section[id]');
const navLinks  = document.querySelectorAll('.side-nav a');

const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navLinks.forEach(a => a.classList.remove('active'));
      const active = document.querySelector(`.side-nav a[href="#${e.target.id}"]`);
      if (active) active.classList.add('active');
    }
  });
}, { rootMargin: '-30% 0px -60% 0px' });

sections.forEach(s => observer.observe(s));

// ── Lightbox: click a demo image to view it enlarged ──
const lightbox = document.createElement('div');
lightbox.className = 'lightbox';
lightbox.setAttribute('role', 'dialog');
lightbox.setAttribute('aria-label', 'Enlarged image view');
lightbox.innerHTML = `
  <button class="lightbox-close" aria-label="Close">&times;</button>
  <img alt="">
  <div class="lightbox-caption"></div>
`;
document.body.appendChild(lightbox);

const lightboxImg     = lightbox.querySelector('img');
const lightboxCaption = lightbox.querySelector('.lightbox-caption');

function openLightbox(src, alt, caption) {
  lightboxImg.src = src;
  lightboxImg.alt = alt || '';
  lightboxCaption.textContent = caption || '';
  lightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.remove('open');
  document.body.style.overflow = '';
}

document.querySelectorAll('.demo-grid figure a').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const img     = link.querySelector('img');
    const caption = link.closest('figure')?.querySelector('figcaption');
    openLightbox(link.href, img?.alt, caption?.textContent);
  });
});

lightbox.addEventListener('click', e => {
  // clicking the backdrop or the close button dismisses; clicking the image does not
  if (e.target !== lightboxImg) closeLightbox();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
});
