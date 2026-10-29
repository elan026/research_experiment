/**
 * Device Profile Model.
 * Represents hardware resource budgets for diverse edge computing classes.
 */

const DEVICE_PROFILES = {
  embedded_telematics: {
    id: 'embedded_telematics',
    name: 'On-Board Linux Telematics Unit',
    description: "Standard IEEE reference benchmark for vehicle on-board computers",
    thresholds: {
      cpu_percent: 30.0,
      ram_mb: 500.0,
      battery_drain_pct_hr: 20.0,
      bandwidth_kb_per_min: 1024.0,
    },
    targetHardware: 'ARM Cortex-A53 / Broadcom Telematics Edge',
  },
  esp32_micro: {
    id: 'esp32_micro',
    name: 'ESP32 / Low-Power Micro-Controller',
    description: "Ultra-constrained IoT tracking node (Paper Ref [4],[6])",
    thresholds: {
      cpu_percent: 20.0,
      ram_mb: 4.0,
      battery_drain_pct_hr: 15.0,
      bandwidth_kb_per_min: 256.0,
    },
    targetHardware: 'Xtensa Dual-Core 240MHz / 520KB SRAM',
  },
  mobile_logger: {
    id: 'mobile_logger',
    name: 'Android Edge Smartphone Unit',
    description: "Android device logger used for the real ISCON-PDPU dataset collection",
    thresholds: {
      cpu_percent: 25.0,
      ram_mb: 256.0,
      battery_drain_pct_hr: 12.0,
      bandwidth_kb_per_min: 512.0,
    },
    targetHardware: 'Qualcomm Snapdragon 6-series / Android 10+',
  },
};

let activeProfileId = 'embedded_telematics';
let customThresholds = { ...DEVICE_PROFILES[activeProfileId].thresholds };

function getProfiles() {
  return Object.values(DEVICE_PROFILES);
}

function getActiveProfile() {
  return {
    profile: DEVICE_PROFILES[activeProfileId],
    currentThresholds: customThresholds,
  };
}

function setActiveProfile(profileId) {
  if (!DEVICE_PROFILES[profileId]) {
    throw new Error(`Device profile '${profileId}' not found.`);
  }
  activeProfileId = profileId;
  customThresholds = { ...DEVICE_PROFILES[profileId].thresholds };
  return getActiveProfile();
}

function updateCustomThresholds(newThresholds) {
  customThresholds = {
    ...customThresholds,
    ...newThresholds,
  };
  return customThresholds;
}

module.exports = {
  getProfiles,
  getActiveProfile,
  setActiveProfile,
  updateCustomThresholds,
};

