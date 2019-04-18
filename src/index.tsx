import { library } from "@fortawesome/fontawesome-svg-core";
import { faFacebook, faGithub, faTwitter } from "@fortawesome/free-brands-svg-icons";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { AppContainer } from "react-hot-loader";
import * as Sentry from "@sentry/browser";

import { App } from "./App";

import "./assets/styles/global.scss";

async function renderApp() {
  // Add icons we want to use from FontAwesome
  library.add(faGithub, faTwitter, faFacebook);

  Sentry.init({
    dsn: "https://748c6f9811fe407ca2853b64bf638690@sentry.io/1419793"
  });

  ReactDOM.render(
    <AppContainer>
      <App />
    </AppContainer>,
    document.querySelector("#root"),
  );
}

if (module.hot) {
  module.hot.accept();
  renderApp();
} else {
  renderApp();
}
