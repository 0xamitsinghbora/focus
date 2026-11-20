/**
 * Focus Landing Page & GUI Download Hub
 * Real-time GitHub Releases API Integration, OS Detection & Platform Downloads
 */

// GitHub Repository Configuration
const GITHUB_OWNER = 'healthOS'
const GITHUB_REPO = 'focus'
const DEFAULT_VERSION = 'v1.0.0'

// Fallback release file info if GitHub API is rate-limited or offline
const FALLBACK_ASSETS = {
  winInstaller: {
    name: 'Focus-Setup-1.0.0.exe',
    size: '111.8 MB',
    url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/Focus-Setup-1.0.0.exe`
  },
  winPortable: {
    name: 'Focus-Portable-1.0.0.exe',
    size: '111.4 MB',
    url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/Focus-Portable-1.0.0.exe`
  },
  macDmg: {
    name: 'Focus-1.0.0.dmg',
    size: '~110 MB',
    url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/Focus-1.0.0.dmg`
  },
  linuxAppImage: {
    name: 'Focus-1.0.0.AppImage',
    size: '~105 MB',
    url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/Focus-1.0.0.AppImage`
  },
  linuxDeb: {
    name: 'Focus-1.0.0.deb',
    size: '~85 MB',
    url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/Focus-1.0.0.deb`
  }
}

/* OS Detection & Dynamic Hero Button Setup */
const OS_ICONS = {
  windows:
    '<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.902-1.799"/></svg>',
  mac: '<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.36c.64-.78 1.08-1.86.96-2.95-1 .04-2.16.66-2.84 1.45-.58.67-1.1 1.76-.96 2.82 1.11.09 2.2-.56 2.84-1.32z"/></svg>',
  linux:
    '<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12.001 2c-2.4 0-4.001 1.6-4.001 4 0 1.2.4 2.2 1.1 3-.7.5-1.5 1.3-1.9 2.2-.4.9-.5 2-.5 3.3 0 1.3.3 2.4.9 3.3.6.9 1.4 1.5 2.4 1.8-.4.5-.7 1.1-.7 1.9 0 1.4 1.1 2.5 2.5 2.5h.4c1.4 0 2.5-1.1 2.5-2.5 0-.8-.3-1.4-.7-1.9 1-.3 1.8-.9 2.4-1.8.6-.9.9-2 .9-3.3 0-1.3-.1-2.4-.5-3.3-.4-.9-1.2-1.7-1.9-2.2.7-.8 1.1-1.8 1.1-3 0-2.4-1.601-4-4.001-4z"/></svg>'
}

function detectVisitorOS() {
  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''

  if (/Win/i.test(platform) || /Windows/i.test(ua)) {
    return 'windows'
  }
  if (/Mac/i.test(platform) || /Macintosh|Mac OS X/i.test(ua)) {
    return 'mac'
  }
  if (/Linux/i.test(platform) || /Linux/i.test(ua)) {
    return 'linux'
  }
  return 'windows' // Default fallback
}

function updateHeroDownloadButton(os, releaseData) {
  const heroBtn = document.getElementById('hero-primary-download-btn')
  const heroIcon = document.getElementById('hero-os-icon')
  const heroHeadline = document.getElementById('hero-download-headline')
  const heroSubline = document.getElementById('hero-download-subline')
  const navDownloadLabel = document.getElementById('nav-download-label')
  const ctaBottomBtn = document.getElementById('bottom-cta-download-btn')

  const version = releaseData ? releaseData.tag_name : DEFAULT_VERSION

  if (os === 'windows') {
    const asset = releaseData?.winInstaller || FALLBACK_ASSETS.winInstaller
    if (heroBtn) heroBtn.href = asset.url
    if (heroIcon) heroIcon.innerHTML = OS_ICONS.windows
    if (heroHeadline) heroHeadline.textContent = 'Download for Windows'
    if (heroSubline)
      heroSubline.textContent = `Setup Installer (.exe) • Free • ${version} • ${asset.size}`
    if (navDownloadLabel) navDownloadLabel.textContent = 'Download'
    if (ctaBottomBtn) {
      ctaBottomBtn.href = asset.url
      ctaBottomBtn.innerHTML = `<span>Download for Windows (${version})</span>`
    }
  } else if (os === 'mac') {
    const asset = releaseData?.macDmg || FALLBACK_ASSETS.macDmg
    if (heroBtn) heroBtn.href = asset.url
    if (heroIcon) heroIcon.innerHTML = OS_ICONS.mac
    if (heroHeadline) heroHeadline.textContent = 'Download for macOS'
    if (heroSubline)
      heroSubline.textContent = `Universal DMG • Apple Silicon & Intel • ${version} • ${asset.size}`
    if (navDownloadLabel) navDownloadLabel.textContent = 'Download'
    if (ctaBottomBtn) {
      ctaBottomBtn.href = asset.url
      ctaBottomBtn.innerHTML = `<span>Download for macOS (${version})</span>`
    }
  } else if (os === 'linux') {
    const asset = releaseData?.linuxAppImage || FALLBACK_ASSETS.linuxAppImage
    if (heroBtn) heroBtn.href = asset.url
    if (heroIcon) heroIcon.innerHTML = OS_ICONS.linux
    if (heroHeadline) heroHeadline.textContent = 'Download for Linux'
    if (heroSubline) heroSubline.textContent = `Universal AppImage • ${version} • ${asset.size}`
    if (navDownloadLabel) navDownloadLabel.textContent = 'Download'
    if (ctaBottomBtn) {
      ctaBottomBtn.href = asset.url
      ctaBottomBtn.innerHTML = `<span>Download for Linux (${version})</span>`
    }
  }
}

/* ==========================================================================
   2. Live GitHub Releases API Query
   ========================================================================== */
async function fetchLatestGitHubRelease() {
  const apiStatus = document.getElementById('releases-api-status')
  const heroTag = document.getElementById('hero-release-tag')
  const navBadge = document.getElementById('nav-version-badge')
  const tagBadge = document.getElementById('github-latest-tag')

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json'
        }
      }
    )

    if (!response.ok) {
      throw new Error(`GitHub API returned status ${response.status}`)
    }

    const data = await response.json()
    const tagName = data.tag_name || DEFAULT_VERSION

    if (heroTag) heroTag.textContent = `Focus ${tagName}`
    if (navBadge) navBadge.textContent = tagName
    if (tagBadge) tagBadge.textContent = tagName

    const parsedAssets = {
      tag_name: tagName
    }

    // Parse assets from release
    if (Array.isArray(data.assets)) {
      let totalDownloads = 0

      data.assets.forEach((asset) => {
        totalDownloads += asset.download_count || 0
        const sizeMb = (asset.size / (1024 * 1024)).toFixed(1) + ' MB'
        const name = asset.name.toLowerCase()

        if (name.includes('setup') && name.endsWith('.exe')) {
          parsedAssets.winInstaller = {
            name: asset.name,
            size: sizeMb,
            url: asset.browser_download_url
          }
          updateCardInfo('win-installer', asset.name, sizeMb, asset.browser_download_url)
        } else if (name.includes('portable') && name.endsWith('.exe')) {
          parsedAssets.winPortable = {
            name: asset.name,
            size: sizeMb,
            url: asset.browser_download_url
          }
          updateCardInfo('win-portable', asset.name, sizeMb, asset.browser_download_url)
        } else if (name.endsWith('.dmg')) {
          parsedAssets.macDmg = { name: asset.name, size: sizeMb, url: asset.browser_download_url }
          updateCardInfo('mac-dmg', asset.name, sizeMb, asset.browser_download_url)
        } else if (name.endsWith('.appimage')) {
          parsedAssets.linuxAppImage = {
            name: asset.name,
            size: sizeMb,
            url: asset.browser_download_url
          }
          updateCardInfo('linux-appimage', asset.name, sizeMb, asset.browser_download_url)
        } else if (name.endsWith('.deb')) {
          parsedAssets.linuxDeb = {
            name: asset.name,
            size: sizeMb,
            url: asset.browser_download_url
          }
          updateCardInfo('linux-deb', asset.name, sizeMb, asset.browser_download_url)
        }
      })

      if (apiStatus) {
        apiStatus.innerHTML = `Synced with GitHub: <strong class="text-white">${tagName}</strong> (${totalDownloads} total downloads)`
      }
    }

    return parsedAssets
  } catch (err) {
    console.warn(
      'GitHub Releases API unavailable or rate-limited; using bundled fallbacks:',
      err.message
    )
    if (apiStatus) {
      apiStatus.innerHTML = `Active Release: <strong class="text-white">${DEFAULT_VERSION}</strong> (Production Mirror)`
    }
    return null
  }
}

function updateCardInfo(typeKey, filename, size, url) {
  const fileEl = document.getElementById(`file-${typeKey}`)
  const sizeEl = document.getElementById(`size-${typeKey}`)
  const btnEl = document.getElementById(`btn-${typeKey}`)

  if (fileEl && filename) fileEl.textContent = filename
  if (sizeEl && size) sizeEl.textContent = size
  if (btnEl && url) btnEl.href = url
}

// Fetch GitHub Stars count
async function fetchGitHubStars() {
  const badge = document.getElementById('github-stars-badge')
  if (!badge) return

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`)
    if (res.ok) {
      const repo = await res.json()
      if (typeof repo.stargazers_count === 'number') {
        badge.textContent = `★ ${repo.stargazers_count}`
      }
    }
  } catch {
    // Ignore rate-limiting for stars
  }
}

/*  Platform Filter Tabs (Windows, macOS, Linux, Source)  */
function selectPlatformTab(osName) {
  const buttons = document.querySelectorAll('.platform-tab-btn')
  const cards = document.querySelectorAll('.download-card')

  buttons.forEach((btn) => {
    const isTarget = btn.getAttribute('data-os') === osName
    btn.classList.toggle('active', isTarget)
    btn.classList.toggle('bg-sky-500', isTarget)
    btn.classList.toggle('text-white', isTarget)
    btn.classList.toggle('text-slate-400', !isTarget)
  })

  cards.forEach((card) => {
    if (osName === 'all' || card.classList.contains(`os-${osName}`)) {
      card.style.display = 'flex'
    } else {
      card.style.display = 'none'
    }
  })
}

function initPlatformFilter() {
  const buttons = document.querySelectorAll('.platform-tab-btn')
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const os = btn.getAttribute('data-os')
      selectPlatformTab(os)
    })
  })
}

/* FAQ Accordion & Checksum Toggle & Mobile Navigation */
function initAccordionAndChecksums() {
  // FAQ toggles
  document.querySelectorAll('.faq-item').forEach((item) => {
    const question = item.querySelector('.faq-question')
    if (question) {
      question.addEventListener('click', () => {
        const isOpen = item.classList.contains('open')
        document.querySelectorAll('.faq-item').forEach((i) => i.classList.remove('open'))
        if (!isOpen) {
          item.classList.add('open')
        }
      })
    }
  })

  // Checksum expander
  const checksumBtn = document.getElementById('checksum-toggle-btn')
  const checksumContent = document.getElementById('checksum-content')
  const checksumChevron = document.getElementById('checksum-chevron')

  if (checksumBtn && checksumContent) {
    checksumBtn.addEventListener('click', () => {
      const isHidden = checksumContent.classList.contains('hidden')
      checksumContent.classList.toggle('hidden', !isHidden)
      if (checksumChevron) {
        checksumChevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)'
      }
    })
  }

  // Mobile menu button
  const mobileBtn = document.getElementById('mobile-menu-btn')
  const mobileMenu = document.getElementById('mobile-menu')

  if (mobileBtn && mobileMenu) {
    mobileBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden')
    })

    mobileMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden')
      })
    })
  }
}

/* Page Initialization */
document.addEventListener('DOMContentLoaded', async () => {
  const detectedOS = detectVisitorOS()

  // Setup platform default view based on detected OS
  selectPlatformTab(detectedOS)
  updateHeroDownloadButton(detectedOS, null)

  initPlatformFilter()
  initAccordionAndChecksums()

  // Query live GitHub release data
  const releaseData = await fetchLatestGitHubRelease()
  if (releaseData) {
    updateHeroDownloadButton(detectedOS, releaseData)
  }

  fetchGitHubStars()
  initStageshowInteractions()
})

/* Stageshow Interactive Demos (benjitaylor/skills) */
function initStageshowInteractions() {
  // 1. Live ticking timer on hero HUD widget
  const heroLiveTimer = document.getElementById('hero-live-timer')
  if (heroLiveTimer) {
    let elapsedSeconds = 34 * 60 + 12
    setInterval(() => {
      elapsedSeconds++
      const mins = Math.floor(elapsedSeconds / 60)
      const secs = elapsedSeconds % 60
      heroLiveTimer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    }, 1000)
  }

  // 2. Soundscape Track Selector in Bento Grid
  const soundPills = document.querySelectorAll('.sound-track-pill')
  soundPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      soundPills.forEach((p) => p.classList.remove('active'))
      pill.classList.add('active')
    })
  })
}
