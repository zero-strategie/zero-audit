import type { Page } from '../../crawl.js';

const HTTP_SUCCESS_MIN = 200;
const HTTP_SUCCESS_MAX = 299;

export const hasHttpResponse = (page: Page): boolean => page.status !== null;

export const isSuccess = (page: Page): boolean =>
  page.status !== null && page.status >= HTTP_SUCCESS_MIN && page.status <= HTTP_SUCCESS_MAX;

export const isHtml2xx = (page: Page): boolean => page.isHtml && isSuccess(page);
