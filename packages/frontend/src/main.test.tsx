import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock }));
const registerMock = vi.fn().mockResolvedValue(undefined);

vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
}));

vi.mock('./App.js', () => ({
  App: () => <div>app</div>,
}));

vi.mock('./styles/globals.css', () => ({}));

describe('main entrypoint', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    registerMock.mockResolvedValue(undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('renders the app and registers the service worker on load', async () => {
    let loadHandler: (() => void) | undefined;
    vi.spyOn(window, 'addEventListener').mockImplementation(((event: string, handler: EventListenerOrEventListenerObject) => {
      if (event === 'load') loadHandler = handler as () => void;
    }) as typeof window.addEventListener);

    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { register: registerMock },
    });

    await import('./main.js');

    expect(createRootMock).toHaveBeenCalledWith(document.getElementById('root'));
    expect(renderMock).toHaveBeenCalled();
    expect(loadHandler).toBeTypeOf('function');

    loadHandler?.();
    expect(registerMock).toHaveBeenCalledWith('/sw.js');
  });

  it('warns when service worker registration fails', async () => {
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerMock.mockRejectedValueOnce(new Error('nope'));
    let loadHandler: (() => void) | undefined;
    vi.spyOn(window, 'addEventListener').mockImplementation(((event: string, handler: EventListenerOrEventListenerObject) => {
      if (event === 'load') loadHandler = handler as () => void;
    }) as typeof window.addEventListener);

    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { register: registerMock },
    });

    await import('./main.js');
    loadHandler?.();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warnMock).toHaveBeenCalledWith('Service worker registration failed:', expect.any(Error));
  });

  it('reloads once when a new service worker takes control', async () => {
    let controllerChange: (() => void) | undefined;
    const swAddEventListener = vi.fn((event: string, handler: () => void) => {
      if (event === 'controllerchange') controllerChange = handler;
    });
    vi.spyOn(window, 'addEventListener').mockImplementation((() => {}) as typeof window.addEventListener);
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadMock },
    });
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { register: registerMock, addEventListener: swAddEventListener },
    });

    await import('./main.js');

    expect(swAddEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function));
    controllerChange?.();
    controllerChange?.();
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('skips registration when service workers are unavailable', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    Reflect.deleteProperty(window.navigator, 'serviceWorker');

    await import('./main.js');

    expect(registerMock).not.toHaveBeenCalled();
    expect(addEventListenerSpy).not.toHaveBeenCalledWith('load', expect.any(Function));
  });
});
