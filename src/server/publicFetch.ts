import { BlockList } from 'node:net';
import { Agent } from 'undici';

const blockList = new BlockList();
blockList.addSubnet('0.0.0.0', 8);
blockList.addSubnet('10.0.0.0', 8);
blockList.addSubnet('100.64.0.0', 10);
blockList.addSubnet('127.0.0.0', 8);
blockList.addSubnet('169.254.0.0', 16);
blockList.addSubnet('172.16.0.0', 12);
blockList.addSubnet('192.168.0.0', 16);
blockList.addSubnet('224.0.0.0', 3);
blockList.addSubnet('::', 96, 'ipv6');
blockList.addSubnet('fc00::', 7, 'ipv6');
blockList.addSubnet('fe80::', 10, 'ipv6');
blockList.addSubnet('ff00::', 8, 'ipv6');

const dispatcher = new Agent({ connect: { blockList } });

export function fetchPublicUrl(url: string, options: RequestInit = {}) {
  const requestOptions = { ...options, dispatcher };
  return fetch(url, requestOptions);
}
