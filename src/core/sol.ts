import { TypedDataEncoder } from 'ethers'

import { TypedData, TypedDataParameter } from 'abitype'
import { TypedDataType } from 'abitype/zod'

import { Config } from '@/core/config'
import { constants } from '@/lib/constants'

export function getPacketHashGetterName(config: Config, typeName: string) {
	if (typeName.includes('[]')) {
		if (config.dangerous.useOverloads) return `getArrayHash`

		return `get${config.dangerous.packetHashName(
			typeName.slice(0, typeName.length - 2)
		)}ArrayHash`
	}

	if (config.dangerous.useOverloads) return `getHash`

	return `get${config.dangerous.packetHashName(typeName)}Hash`
}

export function getDigestGetterName(config: Config, typeName: string) {
	if (config.dangerous.useOverloads) return `getDigest`

	return `get${config.dangerous.packetHashName(typeName)}Digest`
}

export function getSignerGetterName(config: Config, typeName: string) {
	if (config.dangerous.useOverloads) return `getSigner`

	return `get${config.dangerous.packetHashName(typeName)}Signer`
}

export function getEncodedValueFor(config: Config, field: TypedDataParameter) {
	// * Hashed types.
	if (field.type === 'bytes') return `keccak256($input.${field.name})`

	// * String types.
	if (field.type === 'string') return `keccak256(bytes($input.${field.name}))`

	// * Basic types.
	const isBasicType = TypedDataType.safeParse(field.type)

	if (isBasicType.success) return `$input.${field.name}`

	// * Array and object types (ie: nested values.)
	return `${getPacketHashGetterName(config, field.type)}($input.${
		field.name
	})`
}

export const getArrayPacketHashGetter = (
	config: Config,
	typeName: string
): [
	{
		path: string
		markdown: string
	},
	string
] => {
	const documentation = `* @notice Encode ${typeName} data into a packet hash and verify decoded ${typeName} data 
     *         from a packet hash to verify type compliance and value-width alignment.
     * @param $input The ${typeName} data to encode. 
     * @return $packetHash The packet hash of the encoded ${typeName} data.`

	const implementation = `function ${getPacketHashGetterName(
		config,
		typeName
	)}(
        ${typeName} memory $input
    )  public pure virtual returns (bytes32 $packetHash) {
        bytes memory encoded;

        uint256 i;
        uint256 length = $input.length;

        for (i; i < length;) {
            encoded = bytes.concat(
                encoded,
                ${getPacketHashGetterName(
					config,
					typeName.substr(0, typeName.length - 2)
				)}($input[i])
            );

            unchecked { i++; }
        }
        
        $packetHash = keccak256(encoded);
    }`

	const markdown = `# ${getPacketHashGetterName(config, typeName)}

Encode [${typeName}](/base-types/${typeName}) data into a packet hash and verify decoded [${typeName}](/base-types/${typeName}) data from a hash to verify type compliance and value-width alignment.

## Parameters

- \`$input\` : [${typeName}](/base-types/${typeName}) : The \`${typeName}\` data to encode.

## Returns

- \`$packetHash\` : \`bytes32\` : The packet hash of the encoded [${typeName}](/base-types/${typeName}) data.

## Onchain Implementation

::: code-group

\`\`\` solidity [Types.sol:${getPacketHashGetterName(config, typeName)}]
${implementation
	.replace(/ {4}/g, '\t')
	.replace(/\n\t/g, '\n')
	.replace(/^\s+/g, '')}
\`\`\` 

:::`

	return [
		{
			path: `/hash-getters/${getPacketHashGetterName(
				config,
				typeName
			)}.md`,
			markdown
		},
		`\t/**
     ${documentation}
     */
    ${implementation}`
	]
}

export function getPacketHashGetters<
	TTypes extends TypedData,
	TTypename extends keyof TTypes extends string ? keyof TTypes : never
>(
	config: Config,
	typeName: TTypename,
	fields: TTypes[TTypename],
	packetHashGetters: Array<[{ path: string; markdown: string }, string]> = []
) {
	if (typeName.includes('[]')) {
		packetHashGetters.push(getArrayPacketHashGetter(config, typeName))
	} else {
		const documentation = `* @notice Encode ${typeName} data into a packet hash and verify decoded ${typeName} data 
     *         from a packet hash to verify type compliance and value-width alignment.
     * @param $input The ${typeName} data to encode.
     * @return $packetHash The packet hash of the encoded ${typeName} data.`

		// * Generate the Solidity.
		const implementation = `
    function ${getPacketHashGetterName(config, typeName)}(
        ${typeName} memory $input
    ) public pure virtual returns (bytes32 $packetHash) {
        $packetHash = keccak256(abi.encode(
            ${typeName
				.replace(/([a-z])([A-Z])/g, '$1_$2')
				.replace(/([A-Z])([A-Z])(?=[a-z])/g, '$1_$2')
				.replace(/([0-9])([A-Z])/g, '$1_$2')
				.toUpperCase()}_TYPEHASH,
            ${fields
				.map(field => `${getEncodedValueFor(config, field)}`)
				.join(',\n\t\t\t')}
        ));
    }`

		// * Generate the Markdown documentation.
		const markdown = `# ${getPacketHashGetterName(config, typeName)}

Encode [${typeName}](/base-types/${typeName}) data into a packet hash and verify decoded [${typeName}](/base-types/${typeName}) data from a hash to verify type compliance and value-width alignment.

## Parameters

- \`$input\` : [${typeName}](/base-types/${typeName}) : The \`${typeName}\` data to encode.

## Returns

- \`$packetHash\` : \`bytes32\` : The packet hash of the encoded [${typeName}](/base-types/${typeName}) data.

## Onchain Implementation

::: code-group

\`\`\` solidity [Types.sol:${getPacketHashGetterName(config, typeName)}]
${implementation
	.replace(/ {4}/g, '\t')
	.replace(/\n\t/g, '\n')
	.replace(/^\s+/g, '')}
\`\`\` 

:::`

		packetHashGetters.push([
			{
				path: `/hash-getters/${getPacketHashGetterName(
					config,
					typeName
				)}.md`,
				markdown
			},
			`\t/**
     ${documentation}
     */
    ${implementation}`
		])
	}

	fields.forEach(field => {
		if (field.type.includes('[]')) {
			packetHashGetters.push(getArrayPacketHashGetter(config, field.type))
		}
	})

	return packetHashGetters
}

type Documentation = { path: string; markdown: string }
type Getters = Array<[Documentation, string]>

export function getSolidity(config: Config) {
	const results: { struct: string; typeHash: string }[] = []
	const typeHashGetters: Array<Documentation> = []
	const packetHashGetters: Getters = []
	const digestGetters: Getters = []
	const signerGetters: Getters = []

	// @ts-expect-error - Smashing abitype types into ethers.
	const encoder = new TypedDataEncoder(config.types)

	Object.keys(config.types).forEach((typeName: keyof typeof config.types) => {
		// * Determine the name of the type hash constant.
		const typeHashName = `${typeName
			.replace(/([a-z])([A-Z])/g, '$1_$2')
			.replace(/([A-Z])([A-Z])(?=[a-z])/g, '$1_$2')
			.replace(/([0-9])([A-Z])/g, '$1_$2')
			.toUpperCase()}_TYPEHASH`

		const type = config.types[typeName]

		if (!type) return

		const typeHashDocumentation = `
     * @dev Type hash representing the ${typeName} data type providing EIP-712
     *      compatability for encoding and decoding.
     * 
     * ${typeHashName} extends TypeHash<EIP712<{
     *       ${type
			.map(field => {
				return `{ name: '${field.name}', type: '${field.type}' }`
			})
			.join('\n\t *   ')} 
     *     }>>
        `

		const typeHashImplementation = `
    bytes32 constant ${typeHashName} = keccak256('${encoder.encodeType(
		typeName
	)}');`

		const typeHashMarkdown = `# ${typeName}
        
Type hash representing the [${typeName}](/base-types/${typeName}) data type providing EIP-712 compatability for encoding and decoding.

## EIP-712 Type Definition

::: code-group

\`\`\`typescript [${typeName}]
{
    ${type
		.map(field => {
			return `{ name: '${field.name}', type: '${field.type}' }`
		})
		.join(',\n\t')} 
}
\`\`\`

:::

## Onchain Implementation

::: code-group

\`\`\`solidity [Types.sol:${typeHashName}]
${typeHashImplementation
	.replace(/ {4}/g, '\t')
	.replace(/\n\t/g, '\n')
	.replace(/^\s+/g, '')}
\`\`\`

:::`

		typeHashGetters.push({
			path: `/base-types/${typeName}.md`,
			markdown: typeHashMarkdown
		})

		// * Generate the basic solidity code for the type hash.
		const typeHash = `\t/**
        ${typeHashDocumentation}
        */
       ${typeHashImplementation}`

		packetHashGetters.push(
			...getPacketHashGetters(config, typeName, type, packetHashGetters)
		)

		const documentation = `* @notice This struct is used to encode ${typeName} data into a packet hash and
     *         decode ${typeName} data from a packet hash.
     * 
     * @dev ${typeName} extends EIP712<{ 
     *    ${type
			.map(field => {
				return `{ name: '${field.name}', type: '${field.type}' }`
			})
			.join('\n\t *    ')}
     * }>`

		results.push({
			struct: `\t/**
     ${documentation}
     */
    struct ${typeName} {\n${type
		.map(field => {
			return `\t\t${field.type} ${field.name};\n`
		})
		.join('')}\t}`,
			typeHash
		})

		const digestDocumentation = `
        * @notice Encode ${typeName} data into a digest hash.
        * @param $input The ${typeName} data to encode.
        * @return $digest The digest hash of the encoded ${typeName} data.
        `

		const digestImplementation = `
    function ${getDigestGetterName(config, typeName)}(
        ${typeName} memory $input
    ) public view virtual returns (bytes32 $digest) {
        $digest = keccak256(
            abi.encodePacked(
                "\\x19\\x01",
                domainHash,
                ${getPacketHashGetterName(config, typeName)}($input)
            )
        );
    }`

		const digestMarkdown = `# ${getDigestGetterName(config, typeName)}
        
Encode [${typeName}](/base-types/${typeName}) data into a digest hash.

## Parameters

- \`$input\` : [${typeName}](/base-types/${typeName}) : The \`${typeName}\` data to encode.

## Returns

- \`$digest\` : \`bytes32\` : The digest hash of the encoded [${typeName}](/base-types/${typeName}) data.

## Onchain Implementation

::: code-group

\`\`\` solidity [Types.sol:${getDigestGetterName(config, typeName)}]
${digestImplementation
	.replace(/ {4}/g, '\t')
	.replace(/\n\t/g, '\n')
	.replace(/^\s+/g, '')}
\`\`\`

:::`

		// * Generate the digest getter for each type.
		digestGetters.push([
			{
				path: `/digest-getters/${getDigestGetterName(
					config,
					typeName
				)}.md`,
				markdown: digestMarkdown
			},
			`\t/**
        ${digestDocumentation}
        */
       ${digestImplementation}`
		])

		// If the type has a field with the name "signature" then we need to generate a
		// signer getter for it.
		if (type.find(field => field.name === 'signature')) {
			const dataFieldName = type.find(field => field.name !== 'signature')
				?.name

			const signerDocumentation = `
        * @notice Get the signer of a ${typeName} data type.
        * @param $input The ${typeName} data to encode.
        * @return $signer The signer of the ${typeName} data.
            `

			const signerImplementation = `
    function ${getSignerGetterName(config, typeName)}(
        ${typeName} memory $input
    ) public view virtual returns (address $signer) {
        $signer = ${getDigestGetterName(
			config,
			dataFieldName as string
		)}($input.${dataFieldName}).recover(
            $input.signature
        );
    }`

			const signerMarkdown = `# ${getSignerGetterName(config, typeName)}

Get the signer of a [${typeName}](/base-types/${typeName}) data type.

## Parameters

- \`$input\` : [${typeName}](/base-types/${typeName}) : The \`${typeName}\` data to encode.

## Returns

- \`$signer\` : \`address\` : The signer of the [${typeName}](/base-types/${typeName}) data.

## Onchain Implementation

::: code-group

\`\`\` solidity [Types.sol:${getSignerGetterName(config, typeName)}]
${signerImplementation
	.replace(/ {4}/g, '\t')
	.replace(/\n\t/g, '\n')
	.replace(/^\s+/g, '')}
\`\`\`

:::`

			signerGetters.push([
				{
					path: `/signer-getters/${getSignerGetterName(
						config,
						typeName
					)}.md`,
					markdown: signerMarkdown
				},
				`\t/**
        ${signerDocumentation}
        */
       ${signerImplementation}`
			])
		}
	})

	const uniqueTypeHashGetters = [...new Set(typeHashGetters)]
	const uniquePacketHashGetters = [...new Set(packetHashGetters)]
	const uniqueDigestGetters = [...new Set(digestGetters)]
	const uniqueSignerGetters = [...new Set(signerGetters)]

	return {
		setup: results,
		typeHashGetters: uniqueTypeHashGetters,
		packetHashGetters: uniquePacketHashGetters,
		digestGetters: uniqueDigestGetters,
		signerGetters: uniqueSignerGetters
	}
}

export async function generate(config: Config) {
	const {
		setup: eip721Setup,
		typeHashGetters: eip712TypeHashGetters,
		packetHashGetters: eip712PacketHashGetters
	} = getSolidity(constants.config)

	const {
		setup,
		typeHashGetters,
		packetHashGetters,
		digestGetters,
		signerGetters
	} = getSolidity(config)

	// Combine the EIP-721 and EIP-712 types.
	const combinedSetup = [...eip721Setup, ...setup]
	const combinedTypeHashGetters = [
		...eip712TypeHashGetters,
		...typeHashGetters
	]
	const combinedPacketHashGetters = [
		...eip712PacketHashGetters,
		...packetHashGetters
	]

	const lines: string[] = [
		`// SPDX-License-Identifier: ${config.contract.license}\n`,
		`pragma solidity ${config.contract.solidity};\n`,
		`import {ECDSA} from 'solady/src/utils/ECDSA.sol';\n`,
		`/**
 * @title Framework:${config.contract.name}
 * @notice The base EIP-712 types that power a modern intent framework.
 * @dev This file was auto-generated by @nftchance/emporium-types/cli 
 *      and should not be edited directly otherwise the alchemy 
 *      will fail and you will have to pay with a piece of your soul.
 *      (https://github.com/nftchance/emporium-types)
 * @dev This interface and the consuming abstract are auto-generated by
 *      types declared in the framework configuration at (./config.ts). 
 *      As an extensible base, all projects build on top of Delegations 
 *      and Invocations.
${config.contract.authors}
 */`,
		`interface I${config.contract.name} {`
	]

	const structs: string[] = []
	const typeHashes: string[] = []

	combinedSetup.forEach(type => {
		structs.push(type.struct)
		typeHashes.push(type.typeHash)
	})

	// * Interface struct declarations.
	lines.push(structs.join('\n\n'))

	lines.push(`}

/**
 * @title Framework:${config.contract.name} 
 * @dev This file was auto-generated by @nftchance/emporium-types/cli.
 *      (https://github.com/nftchance/emporium-types)
 * @dev This abstract contract is auto-generated and should not be edited directly
 *      however it should be directly inherited from in the consuming protocol
 *      to power the processing of generalized intents.
${config.contract.authors}
 */
abstract contract ${config.contract.name} is I${config.contract.name} {
    /// @notice Use the ECDSA library for signature verification.
    using ECDSA for bytes32;

    /// @notice The hash of the domain separator used in the EIP712 domain hash.
    bytes32 public immutable domainHash;\n`)

	// * Base abstract contract pieces.
	lines.push(typeHashes.join('\n'))

	lines.push(`\t/**
     * @notice Instantiate the contract with the name and version of the protocol.
     * @param $name The name of the protocol.
     * @param $version The version of the protocol.
     * @dev The chainId is pulled from the block and the verifying contract is set to the
     *      address of the contract.
     */
    constructor(string memory $name, string memory $version) {
        /// @dev Sets the domain hash for the contract.
        domainHash = ${getPacketHashGetterName(
			config,
			'EIP712Domain'
		)}(EIP712Domain({
            name: $name,
            version: $version,
            chainId: block.chainid,
            verifyingContract: address(this)
        }));
    }\n`)

	const documentation = combinedTypeHashGetters
		.concat(combinedPacketHashGetters.map(x => x[0]))
		.concat(digestGetters.map(x => x[0]))
		.concat(signerGetters.map(x => x[0]))

	const solidity = {
		packetHashGetters: combinedPacketHashGetters.map(x => x[1]),
		digestGetters: digestGetters.map(x => x[1]),
		signerGetters: signerGetters.map(x => x[1])
	}

	lines.push(solidity.packetHashGetters.join('\n'))
	lines.push(solidity.digestGetters.join('\n\n'))
	lines.push(solidity.signerGetters.join('\n\n'))

	// * Close the smart contract.
	lines.push('}')

	return { lines: lines.join('\n'), documentation }
}
