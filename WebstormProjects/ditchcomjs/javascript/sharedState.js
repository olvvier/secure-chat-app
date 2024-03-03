/**
 * oli b, ditchlabs, 2024
 * pressure feed shared state
 */
let isPressureFeedActive = false;
export const getIsPressureFeedActive = () => isPressureFeedActive;

export const setIsPressureFeedActive = (isActive) => {
    isPressureFeedActive = isActive;
}

let isFeedOtherActive = false;

export const getIsFeedOtherActive = () => isFeedOtherActive;

export const setIsFeedOtherActive = (isActive) => {
    isFeedOtherActive = isActive;
};
