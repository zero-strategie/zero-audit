import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterAll } from 'vitest';

const mockAgent = new MockAgent();
mockAgent.disableNetConnect();
mockAgent.enableNetConnect(/^(127\.0\.0\.1|localhost)(:\d+)?$/);
setGlobalDispatcher(mockAgent);

afterAll(async () => {
  await mockAgent.close();
});
