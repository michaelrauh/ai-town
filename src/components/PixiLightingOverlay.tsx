import { PixiComponent } from '@pixi/react';
import * as PIXI from 'pixi.js';
import type { DayLighting } from '../lib/dayCycle';

type LightingOverlayProps = {
  widthPx: number;
  heightPx: number;
  lighting: DayLighting;
};

function drawOverlay(graphics: PIXI.Graphics, props: LightingOverlayProps) {
  graphics.clear();
  graphics.eventMode = 'none';
  if (props.lighting.alpha <= 0 || props.widthPx <= 0 || props.heightPx <= 0) {
    return;
  }
  graphics.beginFill(props.lighting.color, props.lighting.alpha);
  graphics.drawRect(0, 0, props.widthPx, props.heightPx);
  graphics.endFill();
}

export const PixiLightingOverlay = PixiComponent('LightingOverlay', {
  create: (props: LightingOverlayProps) => {
    const graphics = new PIXI.Graphics();
    drawOverlay(graphics, props);
    return graphics;
  },
  applyProps: (graphics, _oldProps: LightingOverlayProps, newProps: LightingOverlayProps) => {
    drawOverlay(graphics, newProps);
  },
});
