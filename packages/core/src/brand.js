import { t } from './i18n/index.js';

/**
 * Single source of truth for product naming. The name and identifiers are fixed;
 * the taglines and descriptions read from the active locale, so BRAND.tagline is
 * always in the user's language.
 */
export const BRAND = Object.freeze({
  name: 'Agora',
  cliCommand: 'agora',
  packageScope: '@agora',
  regionShort: 'DFW',
  get tagline() {
    return t('brand.tagline');
  },
  get shortDescription() {
    return t('brand.shortDescription');
  },
  get region() {
    return t('brand.region');
  },
  get nonpartisanNote() {
    return t('brand.nonpartisanNote');
  },
  get builtFor() {
    return t('brand.builtFor');
  },
});
