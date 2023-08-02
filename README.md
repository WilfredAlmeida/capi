# Capi Backend


## Getting Started

Take a look at the software versions being used in the next section

Execute the following commands to get started:

1. Fork/Clone the repo
2. `npm install`
3. `npm run dev`

Take a look at the `scripts` in `package.json` to see what else is available.

## Software Versions

`NodeJS v18.15.0`  
`NPM 9.5.0`


## Installing Dependencies

To install dependencies, use `npm`. Along with it, also install the `@types/<dependency>` for typescript.  


Example: `npm install express @types/express`

## Creating Routes & Middlewares

1. Create a new file in the `src/routes` directory. Use `express Router` and export it.
2. Add the route URI in `src/utils/constants.ts`. Beware of the `/` at the start/end of the URI.
3. Import the route in `index.ts`
4. Register the route to express in `index.ts` via `app.use()`

Refer existing routes for more clarity.


## Response Format

```
{
    status: "CAPI_STATUS/ERROR_CODE",
    data: object or null,
    errors:{
        {
            field: "FIELD_NAME" or null,
            message: "ERROR_MESSAGE" must be present
        }
    }
}
```

Response if try/catch exception occurs
```
    return res.status(HttpResponseCode.INTERNAL_SERVER_ERROR).json({
        status: CapiErrorCode.CAPI_OPERATION_FAILED,
        data: null,
        errors: [err]
    });
```

Response if some operation fails
```
    return res.status(HttpResponseCode.BAD_REQUEST).json({
        status: CapiErrorCode.CAPI_OPERATION_FAILED,
        data: null,
        errors: [error]
    });
```

1. client calls /initiateTransaction
2. /initiateTransaction returns
{
    idempotencyId,
    accessToken: JWT, 3min
    rsaPublicKey: RSA public key, 3 min
}





# Docs

## API Endpoints

### User Endpoints

Defined in `/src/routes/user.ts`

1. `/createUser`: POST: Creates the user.


|  | |  |
| --- | --- | --- |
| userName | string, optional |  |
| email | string, needed |  |
| userFullName | string, optional |  |
| profileUrl | string, optional |  |
| fcmToken | string, needed |  |
| verifyToken | string, needed | firebase verifyToken received after google login |

Returns:

|  |  |  |
| --- | --- | --- |
| userId | string |  |
| accessToken | string |  |
| refreshToken | string |  |
|  |  |  |

Returns Capi Status Codes:
|  |  |  |
| --- | --- | --- |
| CAPI_USER_EXISTS | | |
| CAPI_OPERATION_FAILED | | |
| CAPI_USER_CREATED | | |
|  | | |

2. `/getUserDetails`: GET: Gets the user details

Query Params: None

Returns:
|  |  |  |
| --- | --- | --- |
| userId | string |  |
| userName | string, null | |
| userFullName | string, null |  |
| profileUrl | string, null |  |
| email | string |  |
| userStatus | string |  |
| updatedAt | timestamp |  |
|  |  |  |

Returns Capi Status Codes:
|  |  |  |
| --- | --- | --- |
| CAPI_USER_NOT_FOUND | | |
| CAPI_OPERATION_FAILED | | |
| CAPI_USER_FOUND | | |
|  | | |


3. `/updateUser`: POST: Updates the user details
Body:
|  |  |  |
| --- | --- | --- |
| userFullName | string, optional |  |
| profileUrl | string, optional |  |
|  |  |  |

Returns: None

Returns Capi Status Codes:
|  |  |  |
| --- | --- | --- |
| CAPI_OPERATION_FAILED | | |
| CAPI_USER_UPDATED | | |
|  | | |


4. `/checkUsernameAvailability`: POST: Checks if the username is available or not

Body:
|  |  |  |
| --- | --- | --- |
| userName | string |  |

Returns: None

Returns Capi Status Codes:
|  |  |  |
| --- | --- | --- |
| CAPI_OPERATION_FAILED | | |
| CAPI_USER_EXISTS | | |
| CAPI_USER_NOT_FOUND | | |
|  | | |


5. `/changeUserStatus`: POST: Changes the user status. Can be used to block/unblock the user.

Body:
|  |  |  |
| --- | --- | --- |
| userId | string |  |
| userStatus | string |  |
| | | |

Returns: None

Returns Capi Status Codes:
|  |  |  |
| --- | --- | --- |
| CAPI_OPERATION_FAILED | | |
| CAPI_USER_UPDATED | | |
|  | | |

---

### Authentication Endpoints
Defined in `/src/routes/auth.ts`


1. `/getTokens`: POST: Gets the access and refresh tokens

Body: 
|  |  |  |
| --- | --- | --- |
| refreshToken | string | capi refresh token |
| | | |

Returns:
|  |  |  |
| --- | --- | --- |
| accessToken | string |  |
| refreshToken | string |  |
|  |  |  |

Returns Capi Status Codes: None

2. `/login`: POST: Logs in the user

Body:
|  |  |  |
| --- | --- | --- |
| verifyToken | string, needed | firebase verifyToken received after google login |
| email | string, needed |  |
| | | |

Returns:
|  |  |  |
| --- | --- | --- |
| accessToken | string |  |
| refreshToken | string |  |
|  |  |  |

Returns Capi Status Codes: None

> Note: Authenticaiton Flow:  
> Case 1: User sign up via google for the first time.
>   1. User signs up via google
>   2. Call the `/createUser` immediately after the google sign up and pass the needed params.  
>   3. It'll return the `accessToken` and `refreshToken` & create the user in database.
>   4. Don't call the `/login` endpoint. Because the user is not present in the database, JWT will not be generated.

> Case 2: User login via google.
>   1. User logs in via google
>   2. Call the `/login` endpoint and pass the `verifyToken` & `email` received from google login.
>   3. It'll return the `accessToken` and `refreshToken`


---

### Wallet Endpoints
Defined in `/src/routes/wallet.ts`

1. `/setWallet`: POST: Sets the wallet for the user

Body:
|  |  |  |
| --- | --- | --- |
| seedPart1 | string |  |
| seedPart2 | string |  |
| seedPart3 | string |  |
| publicKey | string |  |
| | | |

Returns: None

Returns Capi Status Codes:
|  |  |  |
| --- | --- | --- |
| CAPI_OPERATION_FAILED | | |
| CAPI_WALLET_SET | | |
|  | | |

2. `/getRsaPublicKey`: GET: Gets the RSA public key for encrypting the `/setWallet` body

Query Params: None

Returns:
|  |  |  |
| --- | --- | --- |
| rsaPublicKey | string |  |
|  |  |  |

Returns Capi Status Codes:
|  |  |  |
| --- | --- | --- |
| CAPI_OPERATION_FAILED | | |
| CAPI_OPERATION_SUCCESSFUL | | |
|  | | |

---

### Transaction Endpoints
Defined in `/src/routes/transaction.ts`

1. `/initiateTransaction`: POST: Initiates the transaction

Body:
|  |  |  |
| --- | --- | --- |
| senderPublicKey | string |  |
| | | |

Returns:
|  |  |  |
| --- | --- | --- |
| idempotencyId | string |  |
| authToken | string |  |
| rsaPublicKey | string |  |
|  |  |  |

Returns Capi Status Codes:
|  |  |  |
| --- | --- | --- |
| CAPI_OPERATION_FAILED | | |
| CAPI_TRANSACTION_INITIATED | | |
| CAPI_USER_NOT_FOUND | | |
|  | | |


2. `/doTransaction`: POST: Does the transaction

Send the body encrypted by the public key received in `/initiateTransaction`

Body:
|  |  |  |
| --- | --- | --- |
| idempotencyId | string |  |
| receiverPublicKey | string |  |
| lamports | string | string because its a big number & to maintain floating point accuracy |
| userSecret | string |  |
| comment | string |  |
| | | |

Returns:
|  |  |  |
| --- | --- | --- |
| transactionId | string |  |
|  |  |  |

Returns Capi Status Codes:
|  |  |  |
| --- | --- | --- |
| CAPI_TRANSACTION_INVALID | | |
| CAPI_TRANSACTION_ALREADY_PROCESSED | | |
| CAPI_TRANSACTION_FAILED | | |
| CAPI_WALLET_NOT_FOUND | | |
| CAPI_TRANSACTION_SUCCESSFUL | | |
|  | | |

3. `/getTransactionStatus`: POST: Gets the transaction status

Body:
|  |  |  |
| --- | --- | --- |
| idempotencyId | string |  |
| | | |

Returns:
|  |  |  |
| --- | --- | --- |
| transactionStatus | string |  |
|  |  |  |

Returns Capi Status Codes:
|  |  |  |
| --- | --- | --- |
| CAPI_TRANSACTION_INVALID | | |
| CAPI_OPERATION_FAILED | | |
| `<whatever the status is>` | | |

4. `/getAllTransactions`: GET: Gets all the transactions of the user done via Capi

Query Params:
|  |  |  |
| --- | --- | --- |
| page | number |  |
| pageSize | number |  |
| | | |

Response: Array of transactions
|  |  |  |
| --- | --- | --- |
| transactionId | string |  |
| transactionStatus | string |  |
| amountToTransfer | string |  |
| receiverPublicKey | string |  |
| comment | string |  |
| transactionSignatureHash | string |  |
| createdAt | string |  |
| | | | 

Returns Capi Status Codes:
|  |  |  |
| --- | --- | --- |
| CAPI_OPERATION_FAILED | | |
| CAPI_OPERATION_SUCCESSFUL | | |


---

