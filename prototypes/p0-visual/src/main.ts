import Phaser from 'phaser';
import { makeTextures } from './art';
import { GarageScene } from './GarageScene';
import { RaceScene } from './RaceScene';

class Boot extends Phaser.Scene {
  constructor() { super('boot'); }
  create() {
    makeTextures(this);
    this.scene.start('race');
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 360,
  height: 640,
  backgroundColor: '#10141c',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Boot, GarageScene, RaceScene],
});
