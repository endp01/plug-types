import { ethers, keccak256, toUtf8Bytes, TypedDataEncoder } from 'ethers'

import { TypedData, TypedDataParameter } from 'abitype'
import { TypedDataType } from 'abitype/zod'

import dedent from 'dedent'

import { Config } from '@/core/config'
import { constants } from '@/lib/constants'

export const getPacketHashGetterName = (config: Config, typeName: string) => {
	if (typeName.includes('[]')) {
		if (config.dangerous.useOverloads) return `getArrayHash`

		return `get${config.dangerous.packetHashName(
			typeName.slice(0, typeName.length - 2)
		)}ArrayHash`
	}

	if (config.dangerous.useOverloads) return `getHash`

	return `get${config.dangerous.packetHashName(typeName)}Hash`
}

export const getDigestGetterName = (config: Config, typeName: string) => {
	if (config.dangerous.useOverloads) return `getDigest`

	return `get${config.dangerous.packetHashName(typeName)}Digest`
}

export const getSignerGetterName = (config: Config, typeName: string) => {
	if (config.dangerous.useOverloads) return `getSigner`

	return `get${config.dangerous.packetHashName(typeName)}Signer`
}

export const getEncodedValueFor = (
	config: Config,
	field: TypedDataParameter
) => {
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
	const documentation = `
* @notice Encode ${typeName} data into hash and verify the 
*         decoded ${typeName} data from a packet hash to verify type compliance.
* @param $input The ${typeName} data to encode. 
* @return $hash The packet hash of the encoded ${typeName} data.`

	const implementation = `function ${getPacketHashGetterName(config, typeName)}(
		${config.contract.name}Lib.${typeName} memory $input
) public pure virtual returns (bytes32 $hash) {
		/// @dev Load the stack.
		bytes memory encoded;
		uint256 i;
		uint256 length = $input.length;

		/// @dev Encode each item in the array.
		for (i; i < length; i++) {
			encoded = bytes.concat(
				encoded,
				${getPacketHashGetterName(
					config,
					typeName.slice(0, typeName.length - 2)
				)}($input[i])
			);
		}
    
		/// @dev Hash the encoded array.
		$hash = keccak256(encoded);
}`

	const typeNameSlug = typeName.replace('[]', '')

	const markdown = `---
head:
    - - meta
      - property: og:title
        content: ${getPacketHashGetterName(config, typeName)}
    - - meta
      - name: description
        content: Encode an array of ${typeNameSlug}s into a hash and verify the decoded data to verify type compliance.
    - - meta
      - property: og:description
        content: Encode an array of ${typeNameSlug}s into a hash and verify the decoded data to verify type compliance.
notes:
    - - author: Auto generated by @nftchance/plug-types/cli
---
		
# ${getPacketHashGetterName(config, typeName)}

Encode an array of [${typeNameSlug}s](/generated/base-types/${typeNameSlug}) into a hash and verify the decoded [${typeNameSlug}](/generated/base-types/${typeNameSlug}) data from a hash to verify type compliance.

## Parameters

- \`$input\` : [${typeName}](/generated/base-types/${typeNameSlug}) : The \`${typeName}\` data to encode.

## Returns

- \`$hash\` : \`bytes32\` : The hash of the encoded [${typeNameSlug}](/generated/base-types/${typeNameSlug}) array data.

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

	const functionImplementation = dedent`
		/**${documentation}
		 */
		${implementation}`

	return [
		{
			path: `/hash-getters/${getPacketHashGetterName(
				config,
				typeName
			)}.md`,
			markdown
		},
		functionImplementation
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
		const documentation = dedent`
			* @notice Encode ${typeName} data into a packet hash and verify decoded ${typeName} data 
     			*         from a packet hash to verify type compliance.
     			* @param $input The ${typeName} data to encode.
     			* @return $hash The packet hash of the encoded ${typeName} data.`

		const typeHashName = typeName
			.replace(/([a-z])([A-Z])/g, '$1_$2')
			.replace(/([A-Z])([A-Z])(?=[a-z])/g, '$1_$2')
			.replace(/([0-9])([A-Z])/g, '$1_$2')
			.toUpperCase()

		const typeHashFields = fields
			.map(field => `${getEncodedValueFor(config, field)}`)
			.join(',\n\t\t        ')

		// * Generate the Solidity.
		const implementation = `function ${getPacketHashGetterName(config, typeName)}(
      ${config.contract.name}Lib.${typeName} memory $input
) public pure virtual returns (bytes32 $hash) {
	    $hash = keccak256(
			abi.encode(
				${typeHashName}_TYPEHASH,
				${typeHashFields}
			)
	    );
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

		const path = dedent`/hash-getters/${getPacketHashGetterName(
			config,
			typeName
		)}.md`

		packetHashGetters.push([
			{
				path,
				markdown
			},
			dedent`    /**${documentation}
				    */${implementation}`
		])
	}

	fields
		.filter(field => field.type.includes('[]'))
		.forEach(field => {
			packetHashGetters.push(getArrayPacketHashGetter(config, field.type))
		})

	return packetHashGetters
}

type Documentation = { path: string; markdown: string }
type Getters = Array<[Documentation, string]>

export const generateSolidity = (config: Config) => {
	const results: { struct: string; typeHash: string }[] = []
	const typeHashGetters: Array<Documentation> = []
	const packetHashGetters: Getters = []

	// @ts-expect-error - Smashing abitype types into ethers.
	const encoder = new TypedDataEncoder(config.types)

	Object.keys(config.types).forEach((typeName: keyof typeof config.types) => {
		const typeHashName = `${typeName
			.replace(/([a-z])([A-Z])/g, '$1_$2')
			.replace(/([A-Z])([A-Z])(?=[a-z])/g, '$1_$2')
			.replace(/([0-9])([A-Z])/g, '$1_$2')
			.toUpperCase()}_TYPEHASH`

		const type = config.types[typeName]

		if (!type) return

		const visualizedType = type
			.map(field => {
				return `{ name: '${field.name}', type: '${field.type}' }`
			})
			.join('\n     *      ')

		const typeHashDocumentation = dedent`
			* @notice Type hash representing the ${typeName} data type providing EIP-712
     			*         compatability for encoding and decoding.
     			* @dev ${typeHashName} extends TypeHash<EIP712<{
     			*      ${visualizedType} 
			* }>>`

		const typeHashImplementation = dedent`
			bytes32 constant ${typeHashName} = 
				${keccak256(toUtf8Bytes(encoder.encodeType(typeName)))};`

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
[
	${type
		.map(field => {
			return `{ name: '${field.name}', type: '${field.type}' }`
		})
		.join(',\n\t')} 
]
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
		const typeHash = dedent`    
			/**${typeHashDocumentation}
			 */${typeHashImplementation}`

		packetHashGetters.push(
			...getPacketHashGetters(config, typeName, type, packetHashGetters)
		)

		const typeDefinition = type
			.map(field => `{ name: '${field.name}', type: '${field.type}' }`)
			.join('\n     * \t\t')

		const documentation = dedent`* @notice This struct is used to encode ${typeName} data into a hash and
		     *         decode ${typeName} data from a hash.
		     * 
		     * @dev ${typeName} extends EIP712<{
		     *      ${typeDefinition}
		     * }>`

		results.push({
			struct: `    /**
		     ${documentation}
		     */
		    struct ${typeName} {\n${type
				.map(field => {
					return `\t${field.type} ${field.name};\n`
				})
				.join('')}`,
			typeHash
		})
	})

	const uniqueTypeHashGetters = [...new Set(typeHashGetters)]
	const uniquePacketHashGetters = [...new Set(packetHashGetters)]

	return {
		setup: results,
		typeHashGetters: uniqueTypeHashGetters,
		packetHashGetters: uniquePacketHashGetters
	}
}

export const generate = async (config: Config) => {
	const {
		setup: eip712Setup,
		typeHashGetters: eip712TypeHashGetters,
		packetHashGetters: eip712PacketHashGetters
	} = generateSolidity({
		...constants.config,
		contract: config.contract
	})

	const { setup, typeHashGetters, packetHashGetters } =
		generateSolidity(config)

	const combinedSetup = [...eip712Setup, ...setup]
	const combinedTypeHashGetters = [
		...eip712TypeHashGetters,
		...typeHashGetters
	]
	const combinedPacketHashGetters = [
		...eip712PacketHashGetters,
		...packetHashGetters
	]

	const header = dedent`// SPDX-License-Identifier: ${config.contract.license}
		pragma solidity ${config.contract.solidity};

		import {ECDSA} from 'solady/utils/ECDSA.sol';

		/**
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
 		 */
		library ${config.contract.name}Lib {
			/**
		     * @notice This struct is used to surface the result of a Plug execution.
  			 */ 
			struct Result { 
				bool success;
				bytes result;
			}`

	const lines: string[] = [header]
	const structs: string[] = []
	const typeHashes: string[] = []

	combinedSetup.forEach(type => {
		structs.push(type.struct)
		typeHashes.push(type.typeHash)
	})

	// * Interface struct declarations.
	lines.push(structs.join('\n}\n\n'))

	lines.push(dedent`}}\n
		/**
		 * @title Plug:${config.contract.name} 
		 * @dev This file was auto-generated by @nftchance/plug-types/cli.
		 *      (https://github.com/nftchance/plug-types)
		 * @dev This abstract contract is auto-generated and should not be edited directly
		 *      however it should be directly inherited from in the consuming protocol
		 *      to power the processing of generalized plugs.
		 * @dev Contracts that inherit this one must implement the name() and version()
		 *      functions to provide the domain separator for EIP-712 signatures.
		${config.contract.authors}
		 */
		abstract contract ${config.contract.name} {
		    /// @notice Use the ECDSA library for signature verification.
		    using ECDSA for bytes32;\n\n`)

	// * Base abstract contract pieces.
	lines.push(typeHashes.join('\n\n'))

	lines.push(dedent`
	        /**
	         * @notice Name used for the domain separator.
	         * @dev This is implemented this way so that it is easy
	         *      to retrieve the value and sign the built message.
	         * @return $name The name of the contract.
	         */
	        function name() public pure virtual returns (string memory $name);
	
	        /**
	         * @notice Version used for the domain separator.
	         * @dev This is implemented this way so that it is easy
	         *      to retrieve the value and sign the built message.
	         * @return $version The version of the contract.
	         */
	        function version() public pure virtual returns (string memory $version);
	
	        /**
	         * @notice The symbol of the Socket only used for metadata purposes.
	         * @dev This value is not used in the domain hash for signatures/EIP-712.
	         *      You do not need to override this function as it will always
	         *      automatically generate the symbol based on the override
	         *      using the uppercase letters of the name.
	         * @dev This is implement in assembly simply because Solidity does not
	         *      have dynamic memory arrays and it is the most efficient way
	         *      to generate the symbol.
	         * @return $symbol The symbol of the Socket.
	         */
	        function symbol() public view virtual returns (string memory $symbol) {
	            string memory $name = name();
	
	            assembly {
	                let len := mload($name)
	                let result := mload(0x40)
	                mstore(result, len)
	                let data := add($name, 0x20)
	                let resData := add(result, 0x20)
	
	                let count := 0
	                for { let i := 0 } lt(i, len) { i := add(i, 1) } {
	                    let char := byte(0, mload(add(data, i)))
	                    if and(gt(char, 0x40), lt(char, 0x5B)) {
	                        mstore8(add(resData, count), char)
	                        count := add(count, 1)
	                    }
	                }
	
	                if gt(count, 5) { count := 5 }
	                if iszero(count) {
	                    mstore(resData, 0x504C554753)
	                    /// @dev "PLUGS"
	                    count := 4
	                }
	                mstore(result, count)
	                mstore(0x40, add(add(result, count), 0x20))
	
	                $symbol := result
	            }
	        }\n`)

	const documentation = combinedTypeHashGetters.concat(
		combinedPacketHashGetters.map(x => x[0])
	)

	const solidity = {
		packetHashGetters: combinedPacketHashGetters.map(x => x[1])
	}

	lines.push(solidity.packetHashGetters.join('\n\n'))
	lines.push('}')

	return { lines: lines.join('\n'), documentation }
}
