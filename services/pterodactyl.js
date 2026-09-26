'use strict';

const axios = require('axios');
const logger = require('./logger');
const settings = require('../settings');

function appClient() {
  return axios.create({
    baseURL: `${settings.panelUrl}/api/application`,
    headers: {
      Authorization: `Bearer ${settings.appApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 30000,
  });
}

function clientClient() {
  return axios.create({
    baseURL: `${settings.panelUrl}/api/client`,
    headers: {
      Authorization: `Bearer ${settings.clientApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 30000,
  });
}

function handleError(err, context) {
  const data = err.response?.data;
  const status = err.response?.status;
  
  // Menangkap pesan error asli langsung dari API Pterodactyl
  let realError = 'Unknown error';
  if (data && data.errors && data.errors.length > 0) {
    realError = data.errors.map(e => e.detail || e.code).join(' | ');
  } else if (data && data.message) {
    realError = data.message;
  } else {
    realError = err.message;
  }

  // Menampilkan detail error di terminal/konsol agar mudah dilacak
  logger.error(`[DEBUG ERROR] Pterodactyl [${context}] Status ${status || 'N/A'}: ${realError}`);
  if (data) {
    console.log(`[DEBUG ERROR DETAIL]:`, JSON.stringify(data, null, 2));
  }

  // Melemparkan pesan error yang sesungguhnya ke Telegram user
  throw new Error(`[Status ${status || 'N/A'}] ${realError}`);
}

function validateApplicationKey() {
  if (!settings.appApiKey) {
    throw new Error('PTERO_APP_KEY belum diisi.');
  }
  if (/^ptlc_/i.test(settings.appApiKey)) {
    throw new Error('PTERO_APP_KEY salah jenis. Gunakan Application API key ptla_, bukan Client API key ptlc_.');
  }
}

async function getAllPages(pathname, params = {}) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await appClient().get(pathname, { params: { ...params, page } });
    items.push(...(res.data?.data || []).map(item => item.attributes));
    totalPages = res.data?.meta?.pagination?.total_pages || page;
    page++;
  } while (page <= totalPages);
  return items;
}

// ── Application API ──────────────────────────────────────────────────────────

async function createUser({ username, email, firstName, lastName, password }) {
  try {
    const res = await appClient().post('/users', {
      username,
      email,
      first_name: firstName,
      last_name: lastName,
      password,
    });
    return res.data.attributes;
  } catch (err) {
    handleError(err, 'createUser');
  }
}

async function deleteUser(userId) {
  try {
    await appClient().delete(`/users/${userId}`);
    return true;
  } catch (err) {
    handleError(err, 'deleteUser');
  }
}

async function getUserById(userId) {
  try {
    const res = await appClient().get(`/users/${userId}`);
    return res.data.attributes;
  } catch (err) {
    handleError(err, 'getUserById');
  }
}

async function listUsers(page = 1) {
  try {
    const res = await appClient().get('/users', { params: { page } });
    return res.data;
  } catch (err) {
    handleError(err, 'listUsers');
  }
}

async function searchUsers(query) {
  try {
    const res = await appClient().get('/users', { params: { filter: { username: query }, 'per_page': 50 } });
    return res.data.data.map(u => u.attributes);
  } catch (err) {
    handleError(err, 'searchUsers');
  }
}

async function updateUserPassword(userId, password) {
  try {
    const user = await getUserById(userId);
    const res = await appClient().patch(`/users/${userId}`, {
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      password,
    });
    return res.data.attributes;
  } catch (err) {
    handleError(err, 'updateUserPassword');
  }
}

async function getEggDetails(nestId, eggId) {
  try {
    const res = await appClient().get(`/nests/${nestId}/eggs/${eggId}`, {
      params: { include: 'variables' },
    });
    return res.data.attributes;
  } catch (err) {
    handleError(err, 'getEggDetails');
  }
}

async function createServer({ name, userId, eggData, pkg, nodeId, locationId, allocationId }) {
  try {
    const egg = await getEggDetails(eggData.nestId, eggData.eggId);

    // Build environment variables from egg defaults
    const environment = {};
    if (egg.relationships?.variables?.data) {
      for (const v of egg.relationships.variables.data) {
        const attr = v.attributes;
        // Pastikan format environment sesuai dengan requirement (string)
        environment[attr.env_variable] = attr.default_value !== null ? String(attr.default_value) : '';
      }
    }

    const payload = {
      name,
      user: parseInt(userId),
      nest: parseInt(eggData.nestId),
      egg: parseInt(eggData.eggId),
      docker_image: egg.docker_image,
      startup: egg.startup,
      environment,
      limits: {
        memory: parseInt(pkg.ram ?? 512),
        swap: parseInt(pkg.swap ?? 0),
        disk: parseInt(pkg.disk ?? 1024),
        io: parseInt(pkg.io ?? 500),
        cpu: parseInt(pkg.cpu ?? 100),
        oom_disabled: pkg.oomKiller ? false : true,
      },
      feature_limits: {
        databases: parseInt(pkg.databases ?? 0),
        allocations: 1,
        backups: parseInt(pkg.backups ?? 1),
      },
    };

    if (allocationId) {
      // Target a specific node by pinning a free allocation that belongs to it.
      // The Application API deploys to whichever node owns the given allocation,
      // so 'deploy' (location-based auto-pick) is not used in this case.
      payload.allocation = { default: parseInt(allocationId) };
    } else {
      // No specific node/allocation chosen — let Pterodactyl auto-deploy within the location.
      payload.deploy = {
        locations: [parseInt(locationId || settings.defaultLocationId)],
        dedicated_ip: false,
        port_range: [],
      };
    }

    const res = await appClient().post('/servers', payload);
    return res.data.attributes;
  } catch (err) {
    handleError(err, 'createServer');
  }
}

async function deleteServer(serverId) {
  try {
    await appClient().delete(`/servers/${serverId}`, { params: { force: true } });
    return true;
  } catch (err) {
    handleError(err, 'deleteServer');
  }
}

async function suspendServer(serverId) {
  try {
    await appClient().post(`/servers/${serverId}/suspend`);
    return true;
  } catch (err) {
    handleError(err, 'suspendServer');
  }
}

async function unsuspendServer(serverId) {
  try {
    await appClient().post(`/servers/${serverId}/unsuspend`);
    return true;
  } catch (err) {
    handleError(err, 'unsuspendServer');
  }
}

async function reinstallServer(serverId) {
  try {
    await appClient().post(`/servers/${serverId}/reinstall`);
    return true;
  } catch (err) {
    handleError(err, 'reinstallServer');
  }
}

async function listServers(page = 1) {
  try {
    const res = await appClient().get('/servers', { params: { page } });
    return res.data;
  } catch (err) {
    handleError(err, 'listServers');
  }
}

async function getServerById(serverId) {
  try {
    const res = await appClient().get(`/servers/${serverId}`);
    return res.data.attributes;
  } catch (err) {
    handleError(err, 'getServerById');
  }
}

async function updateServerResources(serverId, limits) {
  try {
    const server = await getServerById(serverId);
    const res = await appClient().patch(`/servers/${serverId}/build`, {
      allocation: server.allocation,
      limits: {
        memory: limits.ram !== undefined ? parseInt(limits.ram) : server.limits.memory,
        swap: limits.swap !== undefined ? parseInt(limits.swap) : server.limits.swap,
        disk: limits.disk !== undefined ? parseInt(limits.disk) : server.limits.disk,
        io: limits.io !== undefined ? parseInt(limits.io) : server.limits.io,
        cpu: limits.cpu !== undefined ? parseInt(limits.cpu) : server.limits.cpu,
      },
      feature_limits: server.feature_limits,
    });
    return res.data.attributes;
  } catch (err) {
    handleError(err, 'updateServerResources');
  }
}

async function listNodes() {
  try {
    const res = await appClient().get('/nodes');
    return res.data.data.map(n => n.attributes);
  } catch (err) {
    handleError(err, 'listNodes');
  }
}

async function getNodeById(nodeId) {
  try {
    const res = await appClient().get(`/nodes/${nodeId}`);
    return res.data.attributes;
  } catch (err) {
    handleError(err, 'getNodeById');
  }
}

async function listNodeAllocations(nodeId) {
  try {
    return await getAllPages(`/nodes/${nodeId}/allocations`);
  } catch (err) {
    handleError(err, 'listNodeAllocations');
  }
}

// Find a free (unassigned) allocation on a node, to target that node when creating a server.
async function getFreeAllocation(nodeId) {
  const allocations = await listNodeAllocations(nodeId);
  const free = (allocations || []).find(a => !a.assigned);
  if (!free) {
    throw new Error(`Node ${nodeId} tidak memiliki allocation kosong. Tambahkan allocation baru di panel atau pilih node lain.`);
  }
  return free;
}

async function updateNode(nodeId, data) {
  try {
    // Node update di Pterodactyl butuh field lengkap, jadi kita ambil data lama
    // dan gabungkan dengan perubahan supaya field yang tidak diubah tetap aman.
    const current = await getNodeById(nodeId);
    const payload = {
      name: current.name,
      description: current.description || '',
      location_id: current.location_id,
      fqdn: current.fqdn,
      scheme: current.scheme,
      behind_proxy: current.behind_proxy,
      public: current.public,
      daemon_base: current.daemon_base,
      daemon_sftp: current.daemon_sftp,
      daemon_listen: current.daemon_listen,
      memory: current.memory,
      memory_overallocate: current.memory_overallocate,
      disk: current.disk,
      disk_overallocate: current.disk_overallocate,
      upload_size: current.upload_size,
      maintenance_mode: current.maintenance_mode,
      ...data,
    };
    const res = await appClient().patch(`/nodes/${nodeId}`, payload);
    return res.data.attributes;
  } catch (err) {
    handleError(err, 'updateNode');
  }
}

async function toggleNodeMaintenance(nodeId, enable) {
  return updateNode(nodeId, { maintenance_mode: !!enable });
}

async function listLocations() {
  try {
    const res = await appClient().get('/locations');
    return res.data.data.map(l => l.attributes);
  } catch (err) {
    handleError(err, 'listLocations');
  }
}

async function listNests() {
  try {
    validateApplicationKey();
    return await getAllPages('/nests');
  } catch (err) {
    handleError(err, 'listNests');
  }
}

async function listEggsForNest(nestId) {
  try {
    validateApplicationKey();
    return await getAllPages(`/nests/${nestId}/eggs`, { include: 'variables' });
  } catch (err) {
    handleError(err, 'listEggsForNest');
  }
}

async function syncEggsFromPanel() {
  const nests = await listNests();
  const result = [];
  for (const nest of nests) {
    const eggs = await listEggsForNest(nest.id);
    for (const egg of eggs) {
      result.push({
        key: `${nest.id}_${egg.id}`,
        nestId: nest.id,
        nestName: nest.name,
        eggId: egg.id,
        name: egg.name,
        description: egg.description || egg.name,
        dockerImage: egg.docker_image,
        startup: egg.startup,
      });
    }
  }
  return result.sort((a, b) => `${a.nestName} ${a.name}`.localeCompare(`${b.nestName} ${b.name}`));
}

// ── Client API ───────────────────────────────────────────────────────────────

async function getServerStatus(identifier) {
  try {
    const res = await clientClient().get(`/servers/${identifier}/resources`);
    return res.data.attributes;
  } catch (err) {
    handleError(err, 'getServerStatus');
  }
}

async function sendPowerSignal(identifier, signal) {
  try {
    await clientClient().post(`/servers/${identifier}/power`, { signal });
    return true;
  } catch (err) {
    handleError(err, 'sendPowerSignal');
  }
}

async function pingPanel() {
  try {
    const start = Date.now();
    await appClient().get('/users', { params: { 'per_page': 1 } });
    return Date.now() - start;
  } catch (err) {
    return -1;
  }
}

async function getApiStatus() {
  try {
    await appClient().get('/users', { params: { 'per_page': 1 } });
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  createUser, deleteUser, getUserById, listUsers, searchUsers, updateUserPassword,
  getEggDetails, createServer, deleteServer, suspendServer, unsuspendServer,
  reinstallServer, listServers, getServerById, updateServerResources,
  listNodes, getNodeById, listNodeAllocations, getFreeAllocation, updateNode, toggleNodeMaintenance,
  listLocations, listNests, listEggsForNest, syncEggsFromPanel,
  getServerStatus, sendPowerSignal, pingPanel, getApiStatus,
};