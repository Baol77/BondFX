/* ========================================
   MINIMAL MOBILE ADAPTATION (No Layout Breaking)
   ======================================== */

class MobileAdaptation {
    constructor() {
        this.isMobile = window.innerWidth <= 480;
        this.isTablet = window.innerWidth > 480 && window.innerWidth <= 1024;
        this.touchDevice = ('ontouchstart' in window);
        this.init();
    }

    init() {
        this.setupViewportMeta();
        this.adaptColumnTitles();
        window.addEventListener('resize', () => this.adaptColumnTitles());
        this.logDeviceInfo();
    }

    adaptColumnTitles() {
        const isMobile = window.innerWidth <= 480;

        document.querySelectorAll('th[data-short]').forEach(th => {
            const title = th.querySelector('.column-title');
            if (!title) return;

            if (!th.dataset.full) {
                th.dataset.full = title.textContent.trim();
            }

            title.textContent = isMobile
                ? th.dataset.short
                : th.dataset.full;
        });
    }

    setupViewportMeta() {
        let meta = document.querySelector('meta[name="viewport"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'viewport';
            document.head.appendChild(meta);
        }
        meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover');
    }

    logDeviceInfo() {
        console.log('📱 Mobile Adaptation initialized:', {
            isMobile: this.isMobile,
            isTablet: this.isTablet,
            isTouchDevice: this.touchDevice,
            viewportWidth: window.innerWidth
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.mobileAdapter = new MobileAdaptation();
});

const ResponsiveHelper = {
    isMobileDevice: () => window.innerWidth <= 480,
    isTabletDevice: () => window.innerWidth > 480 && window.innerWidth <= 1024,
    isTouchDevice: () => 'ontouchstart' in window
};