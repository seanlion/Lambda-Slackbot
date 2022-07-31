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

const sendErrorMeg = async (response) => {
  const status = {}
  status["error_name"] = response.error.name;
  status["error_cause"] = response.error.cause.name;
  status["error_info"] = response.error.cause.info;
  const message = `${status["error_name"]} 에러가 발생했습니다. : ${status["error_cause"]} / ${status["error_info"]}`;
  // console.log("node Status :", status);
  await axios.post(WEBHOOK_URL, {
      "attachments": [
          {
              "fallback": "요청이 실패했습니다.",
              "color": "#2eb886",
              "pretext": "노드 에러",
              "text": message,
              "footer_icon": "https://platform.slack-edge.com/img/default_application_icon.png",
          }
      ]
    })
}


const checkGenesisStatus = async (near) => {
  const response = await near.connection.provider.experimental_protocolConfig({ sync_checkpoint: 'genesis' });
  //console.log("genesis response : ", response);
  const status = {}
  if (response.protocol_version){
    status["genesis_time"] = response.genesis_time.slice(0,19);
    console.log("genesis time : ", status["genesis_time"]);
    const hardforkMsg = response.genesis_height > process.env.BLOCK_HEIGHT ? "Genesis Height가 달라져 하드포크가 필요합니다." : "";
    console.log("hardfork : ", hardforkMsg);
    await axios.post(WEBHOOK_URL, {
        "attachments": [
            {
                "fallback": "요청이 실패했습니다.",
                "color": "#2eb886",
                "text": `Genesis Block Time : ${status["genesis_time"]} | ${hardforkMsg}`
            }
        ]
    })
  }
  if (response.error){
    await sendErrorMeg(response);
    }
  return status;
}

const checkNodeStatus = async (near) => {
  const response = await near.connection.provider.status();
  const status = {}
  if (response.sync_info){
    status["protocol_version_gapped"] = response.latest_protocol_version > response.protocol_version;
    const message = status["protocol_version_gapped"] ? `현재 최신 프로토콜 버전이 아닙니다.` : `현재 최신 프로토콜 버전입니다.`;
    // console.log("node Status :", status);
    await axios.post(WEBHOOK_URL, {
        "attachments": [
            {
                "fallback": "요청이 실패했습니다.",
                "color": "#2eb886",
                "pretext": "프로토콜 버전 관리",
                "text": message,
            },
            {
                "fallback": "요청이 실패했습니다.",
                "color": "#2eb886",
                "text": `최신 Block Time : ${response.sync_info.latest_block_time}`
            }
        ]
    })
  }
  if (response.error){
    await sendErrorMeg(response);
    }
  return status;
}

const checkValidatorStatus = async (near, validator_id) => {
  const response = await near.connection.provider.validators(null);
  const id = validator_id+".factory.shardnet.near";
  const status = {};
  if(response.current_validators){
      const selected_validators = response.current_validators.filter((validator) => {
          return validator.account_id.includes(id);
      })
      console.log("selected_validators : ", selected_validators[0]);
      console.log("Uptime calculation : ", ((selected_validators[0].num_produced_blocks / selected_validators[0].num_expected_blocks) + (selected_validators[0].num_produced_chunks / selected_validators[0].num_expected_chunks)) / 2)
      if(selected_validators.length === 0){
          status["validator_joined"] = false;
          const next_validators = response.next_validators.filter(validator => validator.account_id.includes(id));
          if (next_validators.length === 0){
              status["validator_expected_join"] = false;
          }
          else{
              status["validator_expected_join"] = true;
          }
      }
      else{
          status["validator_joined"] = true;
          status["validator_slashed"] = selected_validators[0].is_slashed;
          status["validator_produced_chunks"] = selected_validators[0].num_produced_chunks;
          status["uptime_ratio"] =  ((selected_validators[0].num_produced_blocks / selected_validators[0].num_expected_blocks) + (selected_validators[0].num_produced_chunks / selected_validators[0].num_expected_chunks)) / 2 * 100;
      }
      const status_message = status["validator_joined"] ? "현재 Validator로 참여 중입니다." : "현재 Validator로 참여하고 있지않습니다.";
      const slashed_message = status["validator_slashed"] ? "Kicked Out 되었습니다" : "Kicked Out 상태가 아닙니다."
      const produced_chunks_message = `Produced Chunks : ${status["validator_produced_chunks"]}`; 
      const upTime_message= status["uptime_ratio"];
      await axios.post(WEBHOOK_URL, {
          "attachments": [
              {
                  "fallback": "Validator join 조회 요청이 실패했습니다.",
                  "color": "#2eb886",
                  "pretext": "Validator 상태",
                  "text": `${status_message} |  ${produced_chunks_message} | Uptime Ratio : ${upTime_message.toFixed(2)}%`,
              },
              {
                  "fallback": "Validator join 조회 요청이 실패했습니다.",
                  "color": "#2eb886",
                  "text": slashed_message,
              },
          ]
      })
      if (!status["validator_joined"]){
          const next_join_message = status["validator_expected_join"] ? "다음 Validator로 참여 예정입니다." : "다음 Validator로 참여하지 않습니다.";
          await axios.post(WEBHOOK_URL, {
              "attachments": [
                  {
                      "fallback": "Validator join 조회 요청이 실패했습니다.",
                      "color": "#2eb886",
                      "text": next_join_message,
                      "footer_icon": "https://platform.slack-edge.com/img/default_application_icon.png",
                  },
              ]
          })
      }
  }
  if (response.error){
    await sendErrorMeg(response);
  }
  return status;
}

module.exports.bot_test = async (event) => {
  try {
    let accountId = `${process.env.ACCOUNT}.shardnet.near`
    const near = await initialize(accountId);
    console.log("initialize ===");
    await checkNodeStatus(near);
    await checkValidatorStatus(near, process.env.ACCOUNT);
    await checkGenesisStatus(near);
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
        {message : e.message},
        null,
        2
      )
    }
  }
};
