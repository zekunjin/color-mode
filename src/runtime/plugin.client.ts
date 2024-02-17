import { computed, reactive, watch } from 'vue'

import type { ColorModeInstance } from './types'
import { defineNuxtPlugin, isVue2, isVue3, useRouter, useHead, useState } from '#imports'
import { globalName, storageKey, dataValue } from '#color-mode-options'

// Initialise to empty object to avoid hard error when hydrating app in test mode
const helper = (window[globalName] || {}) as unknown as {
  preference: string
  value: string
  disableTransition: boolean
  getColorScheme: () => string
  addColorScheme: (className: string) => void
  removeColorScheme: (className: string) => void
}

export default defineNuxtPlugin((nuxtApp) => {
  const colorMode = useState<ColorModeInstance>('color-mode', () => reactive({
    // For SPA mode or fallback
    preference: helper.preference,
    value: helper.value,
    unknown: false,
    forced: false
  })).value

  if (dataValue) {
    if (isVue3) {
      useHead({
        htmlAttrs: { [`data-${dataValue}`]: computed(() => colorMode.value) }
      })
    } else {
      const app = nuxtApp.nuxt2Context.app
      const originalHead = app.head
      app.head = function () {
        const head = (typeof originalHead === 'function' ? originalHead.call(this) : originalHead) || {}
        head.htmlAttrs = head.htmlAttrs || {}
        head.htmlAttrs[`data-${dataValue}`] = colorMode.value
        return head
      }
    }
  }

  useRouter().afterEach((to) => {
    const forcedColorMode = isVue2
      ? (to.matched[0]?.components.default as any)?.options.colorMode
      : to.meta.colorMode

    if (forcedColorMode && forcedColorMode !== 'system') {
      colorMode.value = forcedColorMode
      colorMode.forced = true
    } else {
      if (forcedColorMode === 'system') {
        // eslint-disable-next-line no-console
        console.warn('You cannot force the colorMode to system at the page level.')
      }
      colorMode.forced = false
      colorMode.value = colorMode.preference === 'system'
        ? helper.getColorScheme()
        : colorMode.preference
    }
  })

  let darkWatcher: MediaQueryList

  function watchMedia () {
    if (darkWatcher || !window.matchMedia) { return }

    darkWatcher = window.matchMedia('(prefers-color-scheme: dark)')
    darkWatcher.addEventListener('change', () => {
      if (!colorMode.forced && colorMode.preference === 'system') {
        colorMode.value = helper.getColorScheme()
      }
    })
  }

  watch(() => colorMode.preference, (preference) => {
    if (colorMode.forced) {
      return
    }
    if (preference === 'system') {
      colorMode.value = helper.getColorScheme()
      watchMedia()
    } else {
      colorMode.value = preference
    }

    // Local storage to sync with other tabs
    window.localStorage?.setItem(storageKey, preference)
  }, { immediate: true })

  watch(() => colorMode.value, (newValue, oldValue) => {
    let style: HTMLStyleElement | undefined
    if (helper.disableTransition) {
      style = window!.document.createElement('style')
      const styleString = '*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}'
      style.appendChild(document.createTextNode(styleString))
      window!.document.head.appendChild(style)
    }

    helper.removeColorScheme(oldValue)
    helper.addColorScheme(newValue)

    if (helper.disableTransition) {
      // Calling getComputedStyle forces the browser to redraw
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _ = window!.getComputedStyle(style!).opacity
      document.head.removeChild(style!)
    }
  })

  if (colorMode.preference === 'system') {
    watchMedia()
  }

  nuxtApp.hook('app:mounted', () => {
    if (colorMode.unknown) {
      colorMode.preference = helper.preference
      colorMode.value = helper.value
      colorMode.unknown = false
    }
  })

  nuxtApp.provide('colorMode', colorMode)
})
