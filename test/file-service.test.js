import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';
import { FileService } from '../build/core/file-service.js';
import { FileNotFoundError, ValidationError } from '../build/types/index.js';
import { makeTempDir, silenceConsole } from './helpers.js';

test('isUrl accepts only HTTP and HTTPS URLs', () => {
  assert.equal(FileService.isUrl('https://example.com/a.png'), true);
  assert.equal(FileService.isUrl('http://example.com/a.png'), true);
  assert.equal(FileService.isUrl('ftp://example.com/a.png'), false);
  assert.equal(FileService.isUrl('/tmp/a.png'), false);
  assert.equal(FileService.isUrl('not a url'), false);
});

test('image validation accepts URLs and supported local image files', async (t) => {
  const dir = makeTempDir(t);
  const png = path.join(dir, 'image.PNG');
  fs.writeFileSync(png, Buffer.from('png-data'));

  await assert.doesNotReject(FileService.validateImageSource('https://example.com/image.gif'));
  await assert.doesNotReject(FileService.validateImageSource(png));
});

test('image validation rejects missing, oversized, and unsupported files', async (t) => {
  const dir = makeTempDir(t);
  const gif = path.join(dir, 'image.gif');
  const large = path.join(dir, 'large.png');
  fs.writeFileSync(gif, 'gif');
  fs.writeFileSync(large, 'x');

  await assert.rejects(FileService.validateImageSource(path.join(dir, 'missing.png')), FileNotFoundError);
  await assert.rejects(FileService.validateImageSource(gif), ValidationError);
  await assert.rejects(FileService.validateImageSource(large, 0), /Image file too large/);
});

test('image encoding returns URLs unchanged and local files as data URLs', async (t) => {
  silenceConsole(t);
  const dir = makeTempDir(t);
  const jpg = path.join(dir, 'image.jpg');
  fs.writeFileSync(jpg, Buffer.from('hello'));

  assert.equal(await FileService.encodeImageToBase64('https://example.com/image.jpg'), 'https://example.com/image.jpg');
  assert.equal(await FileService.encodeImageToBase64(jpg), `data:image/jpeg;base64,${Buffer.from('hello').toString('base64')}`);
  assert.equal(FileService.getMimeType('jpeg'), 'image/jpeg');
  assert.equal(FileService.getMimeType('unknown'), 'image/png');
});

test('video validation accepts URLs and supported local video files', async (t) => {
  const dir = makeTempDir(t);
  const mp4 = path.join(dir, 'clip.mp4');
  fs.writeFileSync(mp4, Buffer.from('video'));

  await assert.doesNotReject(FileService.validateVideoSource('https://example.com/clip.avi'));
  await assert.doesNotReject(FileService.validateVideoSource(mp4));
});

test('video validation rejects missing, oversized, and unsupported files', async (t) => {
  const dir = makeTempDir(t);
  const avi = path.join(dir, 'clip.avi');
  const large = path.join(dir, 'large.mov');
  fs.writeFileSync(avi, 'avi');
  fs.writeFileSync(large, 'x');

  await assert.rejects(FileService.validateVideoSource(path.join(dir, 'missing.mp4')), FileNotFoundError);
  await assert.rejects(FileService.validateVideoSource(avi), ValidationError);
  await assert.rejects(FileService.validateVideoSource(large, 0), /exceeds maximum allowed size/);
});

test('video encoding returns URLs unchanged and local files as data URLs', async (t) => {
  silenceConsole(t);
  const dir = makeTempDir(t);
  const mov = path.join(dir, 'clip.mov');
  fs.writeFileSync(mov, Buffer.from('frames'));

  assert.equal(await FileService.encodeVideoToBase64('https://example.com/clip.mp4'), 'https://example.com/clip.mp4');
  assert.equal(await FileService.encodeVideoToBase64(mov), `data:video/quicktime;base64,${Buffer.from('frames').toString('base64')}`);
  assert.equal(FileService.getVideoMimeType('webm'), 'video/webm');
  assert.equal(FileService.getVideoMimeType('unknown'), 'video/mp4');
});
