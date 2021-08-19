import {AuditFunction, AuditResult} from "../types";

export const checkIfTitle: AuditFunction = async (page: any): Promise<AuditResult | false> => {
    const error = {
        name: "check-if-title",
        message:
            "Vous devez avoir un titre principal pour votre page",
    }
    const htmlNode = await page.evaluate(() => document.querySelector("title")) as HTMLTitleElement;
    if (htmlNode) {
        if(htmlNode.text === ''){
            return error
        }
        return false;
    }
    return error;
};
