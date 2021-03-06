import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { CoolMasterHomebridgePlatform } from './platform';
import fetch from 'node-fetch';

export class CoolMasterPlatformAccessory {
  private service: Service;

  constructor(
    private readonly platform: CoolMasterHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.HeaterCooler)
     || this.accessory.addService(this.platform.Service.HeaterCooler);

    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);

    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.handleActiveGet.bind(this))
      .onSet(this.handleActiveSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.handleCurrentHeaterCoolerStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .onGet(this.handleTargetHeaterCoolerStateGet.bind(this))
      .onSet(this.handleTargetHeaterCoolerStateSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState).props.validValues = [1, 2];

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .onGet(this.handleThresholdTemperatureGet.bind(this))
      .onSet(this.handleThresholdTemperatureSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).props.minValue = 16;

    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .onGet(this.handleThresholdTemperatureGet.bind(this))
      .onSet(this.handleThresholdTemperatureSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).props.minValue = 10;

  }

  fetchRetry(url: string) {
    return fetch(url).then(res => {
      if (res.ok) {
        return res;
      }
      return this.fetchRetry(url);
    })
      .catch(() => {
        return this.fetchRetry(url);
      });
  }

  /**
   * Handle requests to get the current value of the "Active" characteristic
   */
  async handleActiveGet() {
    this.platform.log.debug(this.accessory.context.device.displayName + ' Triggered GET Active');

    const response = await this.fetchRetry('http://'+ this.platform.config.ip + ':10103/v1.0/device/'+ this.platform.config.serial
     + '/raw?command=query&' + this.accessory.context.device.uniqueId + '&o');
    const data = await response.json();

    this.platform.log.debug(this.accessory.context.device.displayName + ' Active is ' + Number(data.data[0]));

    return Number(data.data[0]);
  }

  /**
   * Handle requests to set the "Active" characteristic
   */
  async handleActiveSet(value: CharacteristicValue) {
    this.platform.log.debug(this.accessory.context.device.displayName + ' Triggered SET Active:', value);

    await this.fetchRetry('http://'+ this.platform.config.ip + ':10103/v1.0/device/'+ this.platform.config.serial
    + '/raw?command=' + (value ? 'on' : 'off') + '&' + this.accessory.context.device.uniqueId);
  }

  /**
   * Handle requests to get the current value of the "Current Heater-Cooler State" characteristic
   */
  async handleCurrentHeaterCoolerStateGet() {
    this.platform.log.debug(this.accessory.context.device.displayName + ' Triggered GET CurrentHeaterCoolerState');

    const response = await fetch('http://'+ this.platform.config.ip + ':10103/v2.0/device/'+ this.platform.config.serial
     + '/ls2&' + this.accessory.context.device.uniqueId);
    const data = await response.json();

    this.platform.log.debug(this.accessory.context.device.displayName + ' LS2 State: ' + JSON.stringify(data.data[0]));

    if (data.data[0].onoff === 'OFF') {
      this.platform.log.debug(this.accessory.context.device.displayName + ' CurrentHeaterCoolerState is INACTIVE');
      return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    } else if (data.data[0].mode === 'Heat') {
      this.platform.log.debug(this.accessory.context.device.displayName + ' CurrentHeaterCoolerState is HEATING');
      return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
    } else {
      this.platform.log.debug(this.accessory.context.device.displayName + ' CurrentHeaterCoolerState is COOLING');
      return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
    }
  }


  /**
   * Handle requests to get the current value of the "Target Heater-Cooler State" characteristic
   */
  async handleTargetHeaterCoolerStateGet() {
    this.platform.log.debug(this.accessory.context.device.displayName + ' Triggered GET TargetHeaterCoolerState');

    // set this to a valid value for TargetHeaterCoolerState
    let currentValue = this.platform.Characteristic.TargetHeaterCoolerState.COOL;

    const response = await this.fetchRetry('http://'+ this.platform.config.ip + ':10103/v1.0/device/'+ this.platform.config.serial
    + '/raw?command=query&' + this.accessory.context.device.uniqueId + '&m');
    const data = await response.json();

    switch (Number(data.data[0])) {
      case 0:
      case 3:
        this.platform.log.debug(this.accessory.context.device.displayName + ' TargetHeaterCoolerState is COOL');
        currentValue = this.platform.Characteristic.TargetHeaterCoolerState.COOL;
        break;
      case 1:
        this.platform.log.debug(this.accessory.context.device.displayName + ' TargetHeaterCoolerState is HEAT');
        currentValue = this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
        break;
    }

    return currentValue;
  }

  /**
   * Handle requests to set the "Target Heater-Cooler State" characteristic
   */
  async handleTargetHeaterCoolerStateSet(value: CharacteristicValue) {
    this.platform.log.debug(this.accessory.context.device.displayName + ' Triggered SET TargetHeaterCoolerState:', value);

    let response, data;

    switch (value) {
      case this.platform.Characteristic.TargetHeaterCoolerState.COOL:
        await this.fetchRetry('http://'+ this.platform.config.ip + ':10103/v1.0/device/'+ this.platform.config.serial
        + '/raw?command=cool&' + this.accessory.context.device.uniqueId);
        response = await this.fetchRetry('http://'+ this.platform.config.ip + ':10103/v1.0/device/'+ this.platform.config.serial
        + '/raw?command=query&' + this.accessory.context.device.uniqueId + '&h');
        data = await response.json();
        this.platform.log.debug(this.accessory.context.device.displayName + ' CoolingThresholdTemperature is ' + Number(data.data[0]));
        this.service.updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, Number(data.data[0]));
        break;
      case this.platform.Characteristic.TargetHeaterCoolerState.HEAT:
        await this.fetchRetry('http://'+ this.platform.config.ip + ':10103/v1.0/device/'+ this.platform.config.serial
        + '/raw?command=heat&' + this.accessory.context.device.uniqueId);
        response = await this.fetchRetry('http://'+ this.platform.config.ip + ':10103/v1.0/device/'+ this.platform.config.serial
        + '/raw?command=query&' + this.accessory.context.device.uniqueId + '&h');
        data = await response.json();
        this.platform.log.debug(this.accessory.context.device.displayName + ' HeatingThresholdTemperature is ' + Number(data.data[0]));
        this.service.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, Number(data.data[0]));
        break;
    }
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  async handleCurrentTemperatureGet() {
    this.platform.log.debug(this.accessory.context.device.displayName + ' Triggered GET CurrentTemperature');

    const response = await this.fetchRetry('http://'+ this.platform.config.ip + ':10103/v1.0/device/'+ this.platform.config.serial
     + '/raw?command=ls2&' + this.accessory.context.device.uniqueId);
    const data = await response.json();

    this.platform.log.debug(this.accessory.context.device.displayName + ' CurrentTemperature is ' + Number(data.data[0].substr(17, 4)));

    return Number(data.data[0].substr(17, 4));
  }

  async handleThresholdTemperatureGet() {
    this.platform.log.debug(this.accessory.context.device.displayName + ' Triggered GET ThresholdTemperature');

    const response = await this.fetchRetry('http://'+ this.platform.config.ip + ':10103/v1.0/device/'+ this.platform.config.serial
     + '/raw?command=query&' + this.accessory.context.device.uniqueId + '&h');
    const data = await response.json();

    this.platform.log.debug(this.accessory.context.device.displayName + ' ThresholdTemperature is ' + Number(data.data[0]));

    return Number(data.data[0]);
  }

  async handleThresholdTemperatureSet(value: CharacteristicValue) {
    this.platform.log.debug(this.accessory.context.device.displayName + ' Triggered SET ThresholdTemperature:', value);

    await this.fetchRetry('http://'+ this.platform.config.ip + ':10103/v1.0/device/'+ this.platform.config.serial
     + '/raw?command=temp&' + this.accessory.context.device.uniqueId + '&' + value);
  }

}
