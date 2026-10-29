/**
 * Configuration & Hardware Benchmarks Controller.
 */

const deviceProfileModel = require('../models/deviceProfileModel');
const pythonService = require('../services/pythonService');

function getProfiles(req, res) {
  res.json({
    active: deviceProfileModel.getActiveProfile(),
    availableProfiles: deviceProfileModel.getProfiles(),
  });
}

async function selectProfile(req, res, next) {
  try {
    const { profileId } = req.body;
    const active = deviceProfileModel.setActiveProfile(profileId);

    // Synchronize thresholds with python engine
    await pythonService.sendCommand('SET_THRESHOLDS', {
      cpu: active.currentThresholds.cpu_percent,
      ram: active.currentThresholds.ram_mb,
      battery: active.currentThresholds.battery_drain_pct_hr,
      bandwidth: active.currentThresholds.bandwidth_kb_per_min,
    });

    res.json({
      ok: true,
      message: `Device profile switched to '${active.profile.name}'. Benchmarks applied.`,
      active,
    });
  } catch (err) {
    next(err);
  }
}

async function updateThresholds(req, res, next) {
  try {
    const { cpu_percent, ram_mb, battery_drain_pct_hr, bandwidth_kb_per_min } = req.body;
    const updated = deviceProfileModel.updateCustomThresholds({
      ...(cpu_percent !== undefined && { cpu_percent: Number(cpu_percent) }),
      ...(ram_mb !== undefined && { ram_mb: Number(ram_mb) }),
      ...(battery_drain_pct_hr !== undefined && { battery_drain_pct_hr: Number(battery_drain_pct_hr) }),
      ...(bandwidth_kb_per_min !== undefined && { bandwidth_kb_per_min: Number(bandwidth_kb_per_min) }),
    });

    await pythonService.sendCommand('SET_THRESHOLDS', {
      cpu: updated.cpu_percent,
      ram: updated.ram_mb,
      battery: updated.battery_drain_pct_hr,
      bandwidth: updated.bandwidth_kb_per_min,
    });

    res.json({
      ok: true,
      message: 'Hardware operational benchmarks updated in Guideline Layer.',
      thresholds: updated,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProfiles,
  selectProfile,
  updateThresholds,
};

