// Memory Gate headset entry: the IWSDK world (mixed reality, WebXR) with our memory scene on top.
import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { startApp } from './app.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions)
  .then((world) => startApp(world))
  .catch((e: unknown) => {
    console.error('Memory Gate failed to start', e);
    const el = document.getElementById('mg-error');
    const text = document.getElementById('mg-error-text');
    if (el && text) { text.textContent = 'The memory could not start in this browser. Try reloading the page.'; el.classList.remove('mg-hidden'); }
  });
