"use strict";
const nearAPI = require("near-api-js");
const axios = require("axios");

const { keyStores, KeyPair, connect } = nearAPI;
const myKeyStore = new keyStores.InMemoryKeyStore();
const PRIVATE_KEY = process.env.PRIVATE_KEY;
// creates a public / private key pair using the provided private key
const keyPair = KeyPair.fromString(PRIVATE_KEY);
const WEBHOOK_URL = process.env.WEBHOOK_URL;

const initialize = async (account) => {
  try {
      // adds the keyPair you created to keyStore
      await myKeyStore.setKey("shardnet", account, keyPair);
      
      const connectionConfig = {
          networkId: "shardnet",
          keyStore: myKeyStore,
          nodeUrl: "https://rpc.shardnet.near.org",
          walletUrl: "https://wallet.shardnet.near.org",
          explorerUrl: "https://explorer.shardnet.near.org",
      }
      
      const nearConnection = await connect(connectionConfig);
      return nearConnection;
  } catch(e){
      console.log("initialize error:", e);
  }
}

const checkNodeStatus = async (near) => {
  const response = await near.connection.provider.status();
  const status = {}
  if (response.sync_info){
      const protocol_version_gap = response.latest_protocol_version > response.protocol_version;        
      status["protocol_version_gap"] = protocol_version_gap;
      await axios.post(WEBHOOK_URL, {
        "attachments": [
            {
                "fallback": "요청 실패 시 보낼 메시지",
                "color": "#2eb886",
                "pretext": "Lambda Bot",
                "title": "Node Status",
                "text": `프로토콜 버전 차이 : ${protocol_version_gap}`,
            }
        ]
      });
  }
  if (response.error){
      status["error_name"] = response.error.name;
      status["error_cause"] = response.error.cause.name;
      status["error_info"] = response.error.cause.info;
      await axios.post(WEBHOOK_URL, {
        "attachments": [
            {
                "fallback": "요청 실패 시 보낼 메시지",
                "color": "#2eb886",
                "pretext": "Lambda Bot",
                "title": "Node Status",
                "text": `${status["error_name"]} Error : ${status["error_info"]}`,
            }
        ]
      });
  }
  
  return status;
}

const checkValidatorStatus = async (near, account) => {
  const response = await near.connection.provider.validators(null);
  const selected_validator = response.current_validators.filter((validator) => {
      return validator.account_id.includes(account);
  });
  if(selected_validator.length > 0 ){
    const upTime = selected_validator[0].num_expected_blocks / selected_validator[0].num_produced_blocks * 100;
    console.log("Uptime :", upTime);
    await axios.post(WEBHOOK_URL, {
        "attachments": [
            {
                "fallback": "요청 실패 시 보낼 메시지",
                "color": "#2eb886",
                "title": "Node Status",
                "text": `UpTime : ${upTime}%`,
            }
        ]
      });
      return selected_validator[0].is_slashed;
  }
  if (response.error){
    await axios.post(WEBHOOK_URL, {
      "attachments": [
          {
              "fallback": "요청 실패 시 보낼 메시지",
              "color": "#2eb886",
              "pretext": "Lambda Bot",
              "title": "Node Status",
              "text": `${response.error.name} Error : ${response.error.cause.info}`,
          }
      ]
    });
}
  return null;
}

module.exports.bot_test = async (event) => {
  try {
    let accountId = `${process.env.ACCOUNT}.shardnet.near`
    const near = await initialize(accountId);
    console.log("initialize ===");
    await checkNodeStatus(near);
    await checkValidatorStatus(near, `${process.env.ACCOUNT}.factory.shardnet.near`);
    return {
      statusCode: 200,
      body: JSON.stringify(
        { message: "Lambda + Slackbot Test Complete", },
        null,
        2
      ),
    };
  }
  catch(e){
    console.log("Error: ", e);
    return {
      statusCode: 500,
      body : JSON.stringify(
        {message : e},
        null,
        2
      )
    }
  }
};
