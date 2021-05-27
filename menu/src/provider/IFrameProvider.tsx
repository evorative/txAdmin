import React, { createContext, useCallback, useContext, useState } from "react";
import { txAdminMenuPage, usePage } from "../state/page.state";

const iFrameCtx = createContext(null);

type ValidPath = `/${string}`

interface iFrameContextValue {
  goToFramePage: (path: ValidPath) => void;
  setFramePage: (path: ValidPath) => void;
  currentFramePg: string;
  getFullFrameSrc: () => string;
  handleChildPost: (data: IFramePostData) => string;
}

export interface IFramePostData {
  action: string,
  data: unknown
  __isFromChild: true
}

export const useIFrameCtx = () => useContext<iFrameContextValue>(iFrameCtx);

// This allows for global control of the iFrame from other components
export const IFrameProvider: React.FC = ({ children }) => {
  const [curFramePg, setCurFramePg] = useState<ValidPath>("/");
  const [menuPage, setMenuPage] = usePage();
  // Stored in a state for now but can just be a constant probably
  const [txAdminBasePath, setTxAdminBasePath] = useState(
    "http://monitor/WebPipe"
  );

  // Call if you need to both navigate to iFrame page & set the iFrame path
  const goToFramePage = useCallback(
    (path: ValidPath) => {
      if (menuPage !== txAdminMenuPage.IFrame) setMenuPage(txAdminMenuPage.IFrame);
      setCurFramePg(path);
    },
    [menuPage]
  );

  // Will return the full path used in the iFrame, probably dont need to useCallback this
  // but whatever
  const getFullFrameSrc = useCallback(() => txAdminBasePath + curFramePg, [
    txAdminBasePath,
    curFramePg,
  ]);

  // Call if you only need to set the iFrame path for background use, and
  // do not require for the menu to change page
  const setFramePage = useCallback((path: ValidPath) => {
    setCurFramePg(path);
  }, []);

  const handleChildPost = useCallback((data: IFramePostData) => {
    // Probably should have a reducer here or smth, for now lets just log the data
    console.log('Data received from child:', data)
  }, []);


  return (
    <iFrameCtx.Provider
      value={{
        goToFramePage,
        currentFramePath: curFramePg,
        setFramePage,
        getFullFrameSrc,
        handleChildPost
      }}
    >
      {children}
    </iFrameCtx.Provider>
  );
};
