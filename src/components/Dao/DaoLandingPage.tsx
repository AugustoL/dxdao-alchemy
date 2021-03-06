import { IDAOState } from "@daostack/arc.js";
import * as React from "react";
import * as css from "./DaoLandingPage.scss";
import daoConfig from "../../DAOConfig";

import { Link } from "react-router-dom";

type IExternalProps = {
  daoState: IDAOState;
};

type IProps = IExternalProps;

export default class DaoLandingPage extends React.Component<IProps> {

  constructor(props: IProps) {
    super(props);
    this.state = {
      showingEditPagePopup: false,
    };
  }

  public render() {

    if (process.env.DAO_LANDING_PAGE_URL && process.env.DAO_LANDING_PAGE_URL.length > 0) {
      return(
        <div className={css.landingPage}>
          <iframe src="https://gateway.pinata.cloud/ipfs/QmPhoeL14E5SBFBaC4bA3nuRpg3MpxdWVYdPrdXHdQ3EHY/#/">
          </iframe>
        </div>
      )
    } else {
      return (
        <div className={css.landingPage}>

          <div className={css.infoContainer}>
            <div className={css.titleContainer}>
              <div className={css.row}>
                <div className={css.headerText}>{daoConfig.daoName} Voting Dapp</div>
              </div>
            </div>

            <div className={css.welcome}>Welcome to {daoConfig.daoName} voting dapp, a decentralized organization built focused on DEFI.</div>
            
            <div className={css.visitProposals}>Visit the <Link to={`/dao/schemes`}>Proposals section</Link> vote or make a new proposal.</div>
            
            <div className={css.visitProposals}>Visit the <Link to={`/dao/history`}>History section</Link> To see past proposals information and result.</div>
            
            <div className={css.visitProposals}>Visit the <Link to={`/dao/members`}>Members section</Link> To see all {daoConfig.daoName} members.</div>
          </div>
          
        </div>
      );
    }
  }
}
