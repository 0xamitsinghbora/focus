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
    if (heroIcon) heroIcon.textContent = '🪟'
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
    if (heroIcon) heroIcon.textContent = '🍏'
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
    if (heroIcon) heroIcon.textContent = '🐧'
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
})
