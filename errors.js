export const userError = message => Object.assign(new Error(message), {userFacing: true});
