import { nofollowLinkCheck } from './nofollow-link-check.js';

export const check202 = nofollowLinkCheck({
  id: 202,
  severity: 'notice',
  label: 'Page avec des liens externes en nofollow',
  linkType: 'external',
});
