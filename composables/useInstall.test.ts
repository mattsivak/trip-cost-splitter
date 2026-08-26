import { describe, expect, it } from 'vitest'
import { installMode, isIosSafari } from './useInstall'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'

describe('installMode', () => {
  it('offers the browser prompt when there is one', () => {
    expect(installMode({ hasPrompt: true, isStandalone: false, userAgent: ANDROID_CHROME })).toBe('prompt')
  })

  it('falls back to the hand-written route on iOS Safari', () => {
    expect(installMode({ hasPrompt: false, isStandalone: false, userAgent: IPHONE_SAFARI })).toBe('ios')
  })

  it('says nothing on a browser that cannot install', () => {
    expect(installMode({ hasPrompt: false, isStandalone: false, userAgent: ANDROID_CHROME })).toBe('none')
  })

  it('says nothing once the app is installed, prompt or not', () => {
    expect(installMode({ hasPrompt: true, isStandalone: true, userAgent: ANDROID_CHROME })).toBe('none')
    expect(installMode({ hasPrompt: false, isStandalone: true, userAgent: IPHONE_SAFARI })).toBe('none')
  })
})

describe('isIosSafari', () => {
  it('knows the browsers that can add to the home screen from the ones that cannot', () => {
    expect(isIosSafari(IPHONE_SAFARI)).toBe(true)
    expect(isIosSafari(IPHONE_CHROME)).toBe(false)
    expect(isIosSafari(ANDROID_CHROME)).toBe(false)
  })
})
