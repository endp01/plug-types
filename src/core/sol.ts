import { ethers, TypedDataEncoder } from 'ethers'

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
	const documentation = `\n     * @notice Encode ${typeName} data into hash and verify the 
     *         decoded ${typeName} data from a packet hash to verify type compliance.
     * @param $input The ${typeName} data to encode. 
     * @return $hash The packet hash of the encoded ${typeName} data.`

	const implementation = `function ${getPacketHashGetterName(
		config,
		typeName
	)}(
        ${config.contract.name}Lib.${typeName} memory $input
    )  public pure virtual returns (bytes32 $hash) {
        /// @dev Load the stack.
        bytes memory encoded;
        uint256 i;
        uint256 length = $input.length;

        /// @dev Encode each item in the array.
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
        
        /// @dev Hash the encoded array.
        $hash = keccak256(encoded);
    }`

	const markdown = `---
head:
    - - meta
      - property: og:title
        content: ${getPacketHashGetterName(config, typeName)}
    - - meta
      - name: description
        content: Encode an array of ${typeName.replace(
			'[]',
			''
		)}s into a hash and verify the decoded data to verify type compliance.
    - - meta
      - property: og:description
        content: Encode an array of ${typeName.replace(
			'[]',
			''
		)}s into a hash and verify the decoded data to verify type compliance.
notes:
    - - author: Auto generated by @nftchance/plug-types/cli
---

# ${getPacketHashGetterName(config, typeName)}

Encode an array of [${typeName.replace(
		'[]',
		''
	)}s](/generated/base-types/${typeName.replace(
		'[]',
		''
	)}) into a hash and verify the decoded [${typeName.replace(
		'[]',
		''
	)}](/generated/base-types/${typeName.replace(
		'[]',
		''
	)}) data from a hash to verify type compliance.

## Parameters

- \`$input\` : [${typeName}](/generated/base-types/${typeName.replace(
		'[]',
		''
	)}) : The \`${typeName}\` data to encode.

## Returns

- \`$hash\` : \`bytes32\` : The hash of the encoded [${typeName.replace(
		'[]',
		''
	)}](/generated/base-types/${typeName.replace('[]', '')}) array data.

## Onchain Implementation

With \`${getPacketHashGetterName(
		config,
		typeName
	)}\` you can call the function as a \`read\` and get the built hash back. 
    
This is helpful in times when you need to build a message hash without tracking down all the types as well as when you need to verify a signed message hash containing a \`${typeName}\` data type.

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
		`    /**${documentation}
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
		const documentation = `
     * @notice Encode ${typeName} data into a packet hash and verify decoded ${typeName} data 
     *         from a packet hash to verify type compliance.
     * @param $input The ${typeName} data to encode.
     * @return $hash The packet hash of the encoded ${typeName} data.`

		// * Generate the Solidity.
		const implementation = `
    function ${getPacketHashGetterName(config, typeName)}(
        ${config.contract.name}Lib.${typeName} memory $input
    ) public pure virtual returns (bytes32 $hash) {
        $hash = keccak256(abi.encode(
            ${typeName
				.replace(/([a-z])([A-Z])/g, '$1_$2')
				.replace(/([A-Z])([A-Z])(?=[a-z])/g, '$1_$2')
				.replace(/([0-9])([A-Z])/g, '$1_$2')
				.toUpperCase()}_TYPEHASH,
            ${fields
				.map(field => `${getEncodedValueFor(config, field)}`)
				.join(',\n\t    ')}
        ));
    }`

		// * Generate the Markdown documentation.
		const markdown = `---
head:
    - - meta
      - property: og:title
        content: ${getPacketHashGetterName(config, typeName)}
    - - meta
      - name: description
        content: Encode a ${typeName} into a hash and verify the decoded data to verify type compliance.
    - - meta
      - property: og:description
        content: Encode a ${typeName} into a hash and verify the decoded data to verify type compliance.
notes:
    - - author: Auto generated by @nftchance/plug-types/cli
---
        
# ${getPacketHashGetterName(config, typeName)}

Encode a [${typeName}](/generated/base-types/${typeName.replace(
			'[]',
			'Array'
		)}) into a hash and verify the decoded [${typeName}](/generated/base-types/${typeName.replace(
			'[]',
			'Array'
		)}) data from a hash to verify type compliance.

## Parameters

- \`$input\` : [${typeName}](/generated/base-types/${typeName.replace(
			'[]',
			'Array'
		)}) : The \`${typeName}\` data to encode.

## Returns

- \`$hash\` : \`bytes32\` : The packet hash of the encoded [${typeName}](/generated/base-types/${typeName.replace(
			'[]',
			'Array'
		)}) data.

## Onchain Implementation

With \`${getPacketHashGetterName(
			config,
			typeName
		)}\` you can call the function as a \`read\` and get the encoded data back as a hash. 
        
This is helpful in times when you need to build a message hash without tracking down all the types as well as when you need to verify a signed message hash containing a \`${typeName}\` data type.

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
			`    /**${documentation}
     */${implementation}`
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
	const typeKeys = Object.keys(config.types).filter(key => {
		return Object.keys(config.types).includes(`Live${key}`)
	})

	const signerKeys = Object.keys(config.types).filter(key => {
		return Object.keys(config.types).includes(key.replace('Live', ''))
	})

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
     * @notice Type hash representing the ${typeName} data type providing EIP-712
     *         compatability for encoding and decoding.
     * @dev ${typeHashName} extends TypeHash<EIP712<{
     *      ${type
			.map(field => {
				return `{ name: '${field.name}', type: '${field.type}' }`
			})
			.join('\n     *      ')} 
     * }>>`

		const typeHashImplementation = `
    bytes32 constant ${typeHashName} = keccak256(
        '${encoder.encodeType(typeName)}'
    );`

		const nestedTypes = type
			.map(field => field.type.replace('[]', ''))
			.filter(type => {
				return type.charAt(0) === type.charAt(0).toUpperCase()
			})

		const typeMarkdown = `---
head:
    - - meta
      - property: og:title
        content: ${typeName}
    - - meta
      - name: description
        content: A ${typeName} data type provides EIP-712 compatability for encoding and decoding.
    - - meta
      - property: og:description
        content: A ${typeName} data type provides EIP-712 compatability for encoding and decoding. 
notes:
    - - author: Auto generated by @nftchance/plug-types/cli
---

# ${typeName}

A [${typeName}](/generated/base-types/${typeName}) data type provides EIP-712 compatability for encoding and decoding the data needed for an \`Plug\` to be securely distributed and executed. ${
			nestedTypes.length > 0
				? `\n\n::: info
                
Inside the declaration of a \`${typeName}\` data type there are nested ${nestedTypes
						.map(type => `[${type}](/generated/base-types/${type})`)
						.join(', ')
						.replace(
							/, ([^,]*)$/,
							' and $1'
						)} data types that need to be built independently.
                    
:::`
				: ''
		}

## The Data Type

To interact with the data type onchain will you need both the \`Typescript\` and \`EIP-712\` representations of the \`${typeName}\` data type: 

::: code-group

\`\`\` typescript [Typescript/Javascript]
{
    ${type
		.map(field => {
			if (field.type.includes('[]'))
				return `${field.name}: Array<${field.type.slice(
					0,
					field.type.length - 2
				)}>`

			if (
				field.type.includes('bytes') ||
				['address'].includes(field.type)
			)
				return `${field.name}: '0x$\{string}'`

			if (field.type.includes('uint') || field.type.includes('int'))
				return `${field.name}: bigint`

			if (field.type.includes('string')) return `${field.name}: string`

			if (field.type.includes('bool')) return `${field.name}: boolean`

			return `${field.name}: ${field.type}`
		})
		.join(',\n\t')} 
}
\`\`\`

\`\`\`typescript [EIP-712]
{
    ${type
		.map(field => {
			return `{ name: '${field.name}', type: '${field.type}' }`
		})
		.join(',\n\t')} 
}
\`\`\`

:::

::: tip

The \`Typescript\` representation is used to build and work with the object in your dApp and API while the \`EIP-712\` representation is used to encode and decode the data type onchain.

:::

## Onchain Implementation

With ${type
			.map(field => `\`${field.name}\``)
			.join(', ')
			.replace(
				/, ([^,]*)$/,
				' and $1'
			)} as the fields of the \`${typeName}\` data type we can generate the type hash as follows:

::: code-group

\`\`\`solidity [Verbose.sol]
bytes32 constant ${typeHashName} = keccak256(
    abi.encodePacked(
        "${typeName}(",
${type.map(field => `\t\t"${field.type} ${field.name}"`).join(',\n')},
        ")"
    )
);
\`\`\`

\`\`\`solidity [Inline.sol]
bytes32 constant ${typeHashName} = keccak256(
    '${encoder.encodeType(typeName)}'
);
\`\`\`

\`\`\`solidity [Hash.sol]
bytes32 constant ${typeHashName} = ${ethers.keccak256(
			ethers.toUtf8Bytes(encoder.encodeType(typeName))
		)}
\`\`\`

:::`

		typeHashGetters.push({
			path: `/base-types/${typeName}.md`,
			markdown: typeMarkdown
		})

		// * Generate the basic solidity code for the type hash.
		const typeHash = `    /**${typeHashDocumentation}
     */${typeHashImplementation}`

		packetHashGetters.push(
			...getPacketHashGetters(config, typeName, type, packetHashGetters)
		)

		const documentation = `* @notice This struct is used to encode ${typeName} data into a hash and
     *         decode ${typeName} data from a hash.
     * 
     * @dev ${typeName} extends EIP712<{
     * \t\t${type
			.map(field => `{ name: '${field.name}', type: '${field.type}' }`)
			.join('\n     * \t\t')}
     * }>`

		results.push({
			struct: `    /**
     ${documentation}
     */
    struct ${typeName} {\n${type
		.map(field => {
			return `\t${field.type} ${field.name};\n`
		})
		.join('')}    }`,
			typeHash
		})

		const digestDocumentation = `
     * @notice Encode ${typeName} data into a digest hash that has been 
     *         localized to the domain of the contract.
     * @param $input The ${typeName} data to encode.
     * @return $digest The digest hash of the encoded ${typeName} data.`

		const digestImplementation = `
    function ${getDigestGetterName(config, typeName)}(
        ${config.contract.name}Lib.${typeName} memory $input
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
        
Encode [${typeName}](/generated/base-types/${typeName}) data into a digest hash that has been localized to the domain of the contract.

## Parameters

- \`$input\` : [${typeName}](/generated/base-types/${typeName}) : The \`${typeName}\` data to encode.

## Returns

- \`$digest\` : \`bytes32\` : The digest hash of the encoded [${typeName}](/generated/base-types/${typeName}) data.

## Onchain Implementation

::: code-group

\`\`\` solidity [Types.sol:${getDigestGetterName(config, typeName)}]
${digestImplementation
	.replace(/ {4}/g, '\t')
	.replace(/\n\t/g, '\n')
	.replace(/^\s+/g, '')}
\`\`\`

:::`

		if (typeKeys.includes(typeName))
			digestGetters.push([
				{
					path: `/digest-getters/${getDigestGetterName(
						config,
						typeName
					)}.md`,
					markdown: digestMarkdown
				},
				`\n    /**${digestDocumentation}
     */${digestImplementation}`
			])

		if (type.find(field => field.name === 'signature')) {
			const dataFieldName = type.find(field => field.name !== 'signature')
				?.name

			const signerDocumentation = `
     * @notice Get the signer of a ${typeName} data type.
     * @param $input The ${typeName} data to encode.
     * @return $signer The signer of the ${typeName} data.`

			const signerImplementation = `
    function ${getSignerGetterName(config, typeName)}(
        ${config.contract.name}Lib.${typeName} memory $input
    ) public view virtual returns (address $signer) {
        $signer = ${getDigestGetterName(
			config,
			dataFieldName as string
		)}($input.${dataFieldName}).recover(
            $input.signature
        );
    }`

			const signerMarkdown = `# ${getSignerGetterName(config, typeName)}

Get the signer of a [${typeName}](/generated/base-types/${typeName}) data type.

## Parameters

- \`$input\` : [${typeName}](/generated/base-types/${typeName}) : The \`${typeName}\` data to encode.

## Returns

- \`$signer\` : \`address\` : The signer of the [${typeName}](/generated/base-types/${typeName}) data.

## Onchain Implementation

::: code-group

\`\`\` solidity [Types.sol:${getSignerGetterName(config, typeName)}]
${signerImplementation
	.replace(/ {4}/g, '\t')
	.replace(/\n\t/g, '\n')
	.replace(/^\s+/g, '')}
\`\`\`

:::`

			if (signerKeys.includes(typeName))
				signerGetters.push([
					{
						path: `/signer-getters/${getSignerGetterName(
							config,
							typeName
						)}.md`,
						markdown: signerMarkdown
					},
					`\n    /**${signerDocumentation}
     */${signerImplementation}`
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
		setup: eip712Setup,
		typeHashGetters: eip712TypeHashGetters,
		packetHashGetters: eip712PacketHashGetters
	} = getSolidity({
		...constants.config,
		contract: config.contract
	})

	const {
		setup,
		typeHashGetters,
		packetHashGetters,
		digestGetters,
		signerGetters
	} = getSolidity(config)

	// Combine the EIP-721 and EIP-712 types.
	const combinedSetup = [...eip712Setup, ...setup]
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
 * @title Plug:${config.contract.name}
 * @notice The base EIP-712 types that power a modern intent framework.
 * @dev This file was auto-generated by @nftchance/plug-types/cli 
 *      and should not be edited directly otherwise the alchemy 
 *      will fail and you will have to pay with a piece of your soul.
 *      (https://github.com/nftchance/plug-types)
 * @dev This interface and the consuming abstract are auto-generated by
 *      types declared in the framework configuration at (./config.ts). 
 *      As an extensible base, all projects build on top of Pins 
 *      and Plugs.
${config.contract.authors}
 */`,
		`library ${config.contract.name}Lib {`
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
 * @title Plug:${config.contract.name} 
 * @dev This file was auto-generated by @nftchance/plug-types/cli.
 *      (https://github.com/nftchance/plug-types)
 * @dev This abstract contract is auto-generated and should not be edited directly
 *      however it should be directly inherited from in the consuming protocol
 *      to power the processing of generalized plugs.
${config.contract.authors}
 */
abstract contract ${config.contract.name} {
    /// @notice Use the ECDSA library for signature verification.
    using ECDSA for bytes32;

    /// @notice The hash of the domain separator used in the EIP712 domain hash.
    bytes32 public domainHash;\n`)

	// * Base abstract contract pieces.
	lines.push(typeHashes.join('\n\n'))

	lines.push(`\n    /**
     * @notice Initialize the contract with the name and version of the protocol.
     * @param $name The name of the protocol.
     * @param $version The version of the protocol.
     * @dev The chainId is pulled from the block and the verifying contract is set to the
     *      address of the contract.
     */
    function _initializeSocket(
	string memory $name, 
	string memory $version
    ) internal virtual {
        /// @dev Sets the domain hash for the contract.
        domainHash = ${getPacketHashGetterName(config, 'EIP712Domain')}(${
			config.contract.name
		}Lib.EIP712Domain({
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

	lines.push(solidity.packetHashGetters.join('\n\n'))
	lines.push(solidity.digestGetters.join('\n'))
	lines.push(solidity.signerGetters.join('\n'))

	// * Close the smart contract.
	lines.push('}')

	return { lines: lines.join('\n'), documentation }
}
