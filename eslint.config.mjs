import { createConfigForNuxt } from '@nuxt/eslint-config/flat'
import prettier from 'eslint-config-prettier'

export default createConfigForNuxt({
  features: { stylistic: false },
})
  .append({
    rules: {
      // The wizard steps edit the trip object they are handed. It is reactive
      // and owned by the page; routing every field change back up through
      // events would be more machinery than four steps warrant. Reassigning
      // the prop itself is still an error.
      'vue/no-mutating-props': ['error', { shallowOnly: true }],
      'vue/multi-word-component-names': 'off',
    },
  })
  .append(prettier)
  .append({ ignores: ['.nuxt/**', '.output/**', 'dist/**'] })
