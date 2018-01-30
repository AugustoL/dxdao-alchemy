import * as Arc from 'daostack-arc-js';
import promisify = require('es6-promisify');
import * as Redux from 'redux';
import { push } from 'react-router-redux'
import { ThunkAction } from 'redux-thunk';
import * as Web3 from 'web3';

import * as web3Actions from 'actions/web3Actions';
import * as web3Constants from 'constants/web3Constants';
import * as arcConstants from 'constants/arcConstants';
import { IRootState } from 'reducers';
import { IDaoState, ICollaboratorState, IProposalState } from 'reducers/arcReducer';

export function connectToArc() {
  return (dispatch : any) => {
    dispatch(web3Actions.initializeWeb3()).then((results: any) => {
      dispatch(getArcAdresses(results.payload.instance));
    });
  }
}

export function getArcAdresses(web3 : any) {
  return async (dispatch: any, getState: any) => {
    dispatch({ type: arcConstants.ARC_INITIALIZATION_PENDING, payload: null });

    let arcContracts = await Arc.getDeployedContracts();

    let payload = {
      genesisAddress: arcContracts.allContracts['GenesisScheme'].address
    };

    if (web3 != null) {
      web3.version.getNetwork((err : any, currentNetworkId : string) => {
        if (err) {
          dispatch({ type: arcConstants.ARC_INITIALIZATION_REJECTED, payload: null });
          return;
        }
      });
      dispatch({ type: arcConstants.ARC_INITIALIZATION_FULFILLED, payload: payload });
    } else {
      dispatch({ type: arcConstants.ARC_INITIALIZATION_REJECTED, payload: "Failed to get arc addresses, don't know why" });
    }
  };
}

export function getDAOList() {
  return async (dispatch: Redux.Dispatch<any>, getState: Function) => {
    dispatch({ type: arcConstants.ARC_GET_DAOS_PENDING, payload: null });

    const web3 = getState().web3.instance;
    let arcContracts = await Arc.getDeployedContracts();

    const genesisContract = await Arc.Utils.requireContract("GenesisScheme");
    const genesisInstance = await genesisContract.deployed();

    // Get the list of daos we populated on the blockchain during genesis by looking for NewOrg events
    const newOrgEvents = genesisInstance.NewOrg({}, { fromBlock: 0 })
    newOrgEvents.get(async (err : Error, eventsArray : any[]) => {
      if (err) {
        dispatch({ type: arcConstants.ARC_GET_DAOS_REJECTED, payload: "Error getting new daos from genesis contract: " + err.message });
      }

      let daos = <{ [key : string] : IDaoState }>{};

      for (let index = 0; index < eventsArray.length; index++) {
        const event = eventsArray[index];
        daos[event.args._avatar] = await getDAOData(event.args._avatar, web3);
      }

      dispatch({ type: arcConstants.ARC_GET_DAOS_FULFILLED, payload: daos });
    });
  };
}

export function getDAO(avatarAddress : string) {
  return async (dispatch: any, getState: any) => {
    dispatch({ type: arcConstants.ARC_GET_DAO_PENDING, payload: null });

    const web3 = getState().web3.instance;
    const daoData = await getDAOData(avatarAddress, web3, true);
    dispatch({ type: arcConstants.ARC_GET_DAO_FULFILLED, payload: daoData });
  }
}

export async function getDAOData(avatarAddress : string, web3 : any, detailed = false) {
  const dao = await Arc.DAO.at(avatarAddress);

  let daoData : IDaoState = {
    avatarAddress: avatarAddress,
    controllerAddress: "",
    name: await dao.getName(),
    members: [],
    rank: 1, // TODO
    promotedAmount: 0,
    proposals: {},
    reputationAddress: await dao.controller.nativeReputation(),
    reputationCount: Number(web3.fromWei(await dao.reputation.totalSupply(), "ether")),
    tokenAddress: await dao.controller.nativeToken(),
    tokenCount: Number(web3.fromWei(await dao.token.totalSupply(), "ether")),
    tokenName: await dao.getTokenName(),
    tokenSymbol: await dao.getTokenSymbol(),
  };

  if (detailed) {
    // Get all collaborators
    const mintTokenEvents = dao.token.Mint({}, { fromBlock: 0 })
    const transferTokenEvents = dao.token.Transfer({}, { fromBlock: 0 });
    const mintReputationEvents = dao.reputation.Mint({}, { fromBlock: 0 });
    let collaboratorAddresses : string[] = [];

    const getMintTokenEvents = promisify(mintTokenEvents.get.bind(mintTokenEvents));
    let eventsArray = await getMintTokenEvents();
    for (let cnt = 0; cnt < eventsArray.length; cnt++) {
      collaboratorAddresses.push(eventsArray[cnt].args.to);
    }

    const getTransferTokenEvents = promisify(transferTokenEvents.get.bind(transferTokenEvents));
    eventsArray = await getTransferTokenEvents();
    for (let cnt = 0; cnt < eventsArray.length; cnt++) {
      collaboratorAddresses.push(eventsArray[cnt].args.to);
    }

    const getMintReputationEvents = promisify(mintReputationEvents.get.bind(mintReputationEvents));
    eventsArray = await getMintReputationEvents();
    for (let cnt = 0; cnt < eventsArray.length; cnt++) {
      collaboratorAddresses.push(eventsArray[cnt].args.to);
    }

    collaboratorAddresses = [...new Set(collaboratorAddresses)]; // Dedupe

    let collaborators : ICollaboratorState[] = [];
    for (let cnt = 0; cnt < collaboratorAddresses.length; cnt++) {
      const address = collaboratorAddresses[cnt];
      let collaborator = { address: address, tokens: 0, reputation: 0 };
      const tokens = await dao.token.balanceOf.call(address)
      collaborator.tokens = Number(web3.fromWei(tokens, "ether"));
      const reputation = await dao.reputation.reputationOf.call(address);
      collaborator.reputation = Number(web3.fromWei(reputation, "ether"));
      collaborators.push(collaborator);
    }
    daoData.members = collaborators;

    // Get proposals
    const votingMachineInstance = dao.votingMachine;
    const contributionRewardInstance = await Arc.ContributionReward.deployed();
    const newProposalEvents = contributionRewardInstance.LogNewContributionProposal({}, { fromBlock: 0 });
    const getNewProposalEvents = promisify(newProposalEvents.get.bind(newProposalEvents));
    const allProposals = await getNewProposalEvents();

    const executedProposalEvents = contributionRewardInstance.LogProposalExecuted({}, { fromBlock: 0 })
    const getExecutedProposalEvents = promisify(executedProposalEvents.get.bind(executedProposalEvents));
    const executedProposals = await getExecutedProposalEvents();
    const executedProposalIds = executedProposals.map((proposal : any) => proposal.args._proposalId);

    const failedProposalEvents = contributionRewardInstance.LogProposalDeleted({}, { fromBlock: 0 });
    const getFailedProposalEvents = promisify(failedProposalEvents.get.bind(failedProposalEvents));
    const failedProposals = await getFailedProposalEvents();
    const failedProposalIds = failedProposals.map((proposal : any) => proposal.args._proposalId);

    let proposalArgs : any;
    for (let cnt = 0; cnt < allProposals.length; cnt++) {
      proposalArgs = allProposals[cnt].args;
      if (proposalArgs._avatar == dao.avatar.address) {
        let proposal = <IProposalState>{
          abstainVotes: 0,
          beneficiary: proposalArgs._beneficiary,
          description: proposalArgs._contributionDesciption,
          failed: false,
          noVotes: 0,
          open: true,
          passed: false,
          proposalId: proposalArgs._proposalId,
          reputationReward: Number(web3.fromWei(proposalArgs._rewards[1], "ether")),
          tokenReward: Number(web3.fromWei(proposalArgs._rewards[0], "ether")),
          yesVotes: 0
        };

        if (executedProposalIds.includes(proposalArgs._proposalId)) {
          proposal.passed = true;
          proposal.open = false;
        } else if (failedProposalIds.includes(proposalArgs._proposalId)) {
          proposal.failed = true;
          proposal.open = false;
        } else {
          const votesStatus = await votingMachineInstance.votesStatus(proposalArgs._proposalId);
          proposal.abstainVotes = Number(web3.fromWei(votesStatus[0], "ether"));
          proposal.yesVotes = Number(web3.fromWei(votesStatus[1], "ether"));
          proposal.noVotes = Number(web3.fromWei(votesStatus[2], "ether"));
        };
        daoData.proposals[proposalArgs._proposalId] = proposal;
      }
    }
  }

  return daoData;
}

export function createDAO(daoName : string, tokenName: string, tokenSymbol: string, collaborators: any) : ThunkAction<any, IRootState, null> {
  return async (dispatch: Redux.Dispatch<any>, getState: () => IRootState) => {
    dispatch({ type: arcConstants.ARC_CREATE_DAO_PENDING, payload: null });
    try {
      const web3 : Web3 = getState().web3.instance;

      let founders : Arc.FounderConfig[] = [], collaborator;
      collaborators.sort((a : any, b : any) => {
        b.reputation - a.reputation;
      });
      for (let i = 0; i < collaborators.length; i++) {
        collaborator = collaborators[i];
        founders[i] = {
          address : collaborator.address,
          tokens : web3.toWei(collaborator.tokens, "ether"),
          reputation: web3.toWei(collaborator.reputation, "ether")
        }
      }

      let schemes = [{
        name: "ContributionReward"
      }];

      let dao = await Arc.DAO.new({
        orgName: daoName,
        tokenName: tokenName,
        tokenSymbol: tokenSymbol,
        founders: founders,
        schemes: schemes
      });

      let daoData : IDaoState = {
        avatarAddress: dao.avatar.address,
        controllerAddress: dao.controller.address,
        name: daoName,
        members: [],
        rank: 1, // TODO
        promotedAmount: 0,
        proposals: {},
        reputationAddress: dao.reputation.address,
        reputationCount: 0,
        tokenAddress: dao.token.address,
        tokenCount: 0,
        tokenName: tokenName,
        tokenSymbol: tokenSymbol
      };

      dispatch({ type: arcConstants.ARC_CREATE_DAO_FULFILLED, payload: daoData });
      dispatch(push('/dao/' + dao.avatar.address));
    } catch (err) {
      dispatch({ type: arcConstants.ARC_CREATE_DAO_REJECTED, payload: err.message });
    }
  } /* EO createDAO */
}

export function createProposition(daoAvatarAddress : string, description : string, nativeTokenReward: number, reputationReward: number, beneficiary: string) : ThunkAction<any, IRootState, null> {
  return async (dispatch: Redux.Dispatch<any>, getState: () => IRootState) => {
    dispatch({ type: arcConstants.ARC_CREATE_PROPOSITION_PENDING, payload: null });
    try {
      const web3 : Web3 = getState().web3.instance;
      const ethAccountAddress : string = getState().web3.ethAccountAddress;

      const contributionRewardInstance = await Arc.ContributionReward.deployed();

      const submitProposalTransaction = await contributionRewardInstance.proposeContributionReward({
        avatar: daoAvatarAddress,
        description: description,
        nativeTokenReward : web3.toWei(nativeTokenReward, "ether"),
        reputationReward : web3.toWei(reputationReward, "ether"),
        beneficiary : beneficiary,
      });

      // TODO: error checking
      const proposalId = submitProposalTransaction.proposalId;
      const proposal = <IProposalState>{
        abstainVotes: 0,
        beneficiary: beneficiary,
        description: description,
        failed: false,
        noVotes: 0,
        open: true,
        daoAvatarAddress: daoAvatarAddress,
        passed: false, // TODO: This could actually be true if owner had enough rep, should probably pull the updated proposal info from the voting machine
        proposalId: proposalId,
        reputationReward: reputationReward,
        tokenReward: nativeTokenReward,
        yesVotes: 0, // TODO: actually this is probably the reputation of the opener with ownerVote turned on.
      };

      dispatch({ type: arcConstants.ARC_CREATE_PROPOSITION_FULFILLED, payload: proposal });
      dispatch(push('/dao/' + daoAvatarAddress));
    } catch (err) {
      dispatch({ type: arcConstants.ARC_CREATE_PROPOSITION_REJECTED, payload: err.message });
    }
  }
}

export function voteOnProposition(daoAvatarAddress: string, proposalId: string|number, voterAddress: string, vote: number) {
  return async (dispatch: Redux.Dispatch<any>, getState: () => IRootState) => {
    dispatch({ type: arcConstants.ARC_VOTE_PENDING, payload: null });
    try {
      const web3 : Web3 = getState().web3.instance;
      const ethAccountAddress : string = getState().web3.ethAccountAddress;

      const daoInstance = await Arc.DAO.at(daoAvatarAddress);
      const votingMachineInstance = await daoInstance.votingMachine;
      const voteTransaction = await votingMachineInstance.vote(proposalId, vote, { from: ethAccountAddress, gas: 4000000 });
      const votesStatus = await votingMachineInstance.votesStatus(proposalId);

      let payload = {
        abstainVotes: Number(web3.fromWei(votesStatus[0], "ether")),
        failed: false,
        noVotes: Number(web3.fromWei(votesStatus[2], "ether")),
        daoAvatarAddress: daoAvatarAddress,
        open: true,
        passed: false,
        proposalId: proposalId,
        yesVotes: Number(web3.fromWei(votesStatus[1], "ether"))
      }

      // See if the proposition was executed, either passing or failing
      const executed = voteTransaction.logs.find((log : any) => log.event == "LogExecuteProposal");
      if (executed) {
        const decision = executed.args._decision.toNumber();
        payload.open = false;
        if (decision == 1) {
          payload.passed = true;
        } else if (decision == 2) {
          payload.failed = true;
        } else {
          dispatch({ type: arcConstants.ARC_VOTE_REJECTED, payload: "Unknown proposition decision ", decision });
          return
        }
      }

      dispatch({ type: arcConstants.ARC_VOTE_FULFILLED, payload: payload });
    } catch (err) {
      dispatch({ type: arcConstants.ARC_VOTE_REJECTED, payload: err.message });
    }
  }
}