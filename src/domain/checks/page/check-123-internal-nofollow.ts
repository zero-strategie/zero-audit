import { nofollowLinkCheck } from './nofollow-link-check.js';

export const check123 = nofollowLinkCheck({
  id: 123,
  severity: 'warning',
  label: 'Page avec des liens internes en nofollow',
  linkType: 'internal',
});
