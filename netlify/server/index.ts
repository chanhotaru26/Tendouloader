import type { Config } from '@netlify/server';
import { createServer } from 'node:http';
import { createMediaApp } from '../../src/server/app.ts';

export const config: Config = { path: '/api/*' };

export default createServer(createMediaApp());
